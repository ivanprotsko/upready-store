import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createRegionsWorkflow, updateRegionsWorkflow } from "@medusajs/medusa/core-flows";

/**
 * Creates (or converges) the one USD region cherkashino.com checks out in
 * (t-cherk-34). Every country on this backend already belongs to its own
 * single-country region — the upstream dtc-starter demo seed makes one region
 * per ISO country (`src/migration-scripts/data/regions/json`, 241 files,
 * "United States" / usd among them) — so giving "International" a country
 * means taking it away from whatever region holds it today, not handing out
 * an unclaimed one. `ru` is the one country this script will never touch,
 * named or not: Russia stays the Russian region's, full stop (Ivan, 02.10).
 *
 *   npx medusa exec ./src/scripts/ensure-international-region.ts \
 *     [countries=us,gb,de,fr,...] [name=International] [dry-run]
 *
 * `countries` is a comma-separated, lowercase ISO 3166-1 alpha-2 list. Left
 * out, `DEFAULT_COUNTRIES` below stands in — a placeholder until the owner
 * sends the real one (t-cherk-34 brief). Arguments carry no leading dashes:
 * `medusa exec` parses the command line itself and rejects a flag it does not
 * know (the same trap `backfill-product-attributes.ts` documents).
 *
 * Idempotent and additive: a second run with the same `countries` changes
 * nothing, and a shorter list on a later run never takes a country OUT of
 * "International" — only `countries=` growing does that, by moving the new
 * additions out of wherever they live today. Shrinking the region, if ever
 * needed, is a human decision and not this script's.
 *
 * NOT wired into `docker-entrypoint.sh`: unlike `link-robokassa-regions.js`
 * (which only ever ADDS a payment provider link), this script restructures
 * which region owns a country, a one-way move each time a new country is
 * added. Wire it in once the owner's real country list lands.
 */

const REGION_CURRENCY = "usd";
const SYSTEM_DEFAULT_PROVIDER_ID = "pp_system_default";
const PROTECTED_COUNTRIES = new Set(["ru"]);

/**
 * Left out of DEFAULT_COUNTRIES on purpose: cherkashino.com's
 * `tenant_locale_settings.default_country` already points at "us"
 * (`set-tenant-usd-default.ts`, t-cherk-com-hotfix batch 6 item 7), so a bare
 * run of this script (no `countries=` flag, no `COUNTRIES` env) must never
 * reassign it away from its current single-country region. Unlike
 * PROTECTED_COUNTRIES this is not a standing ban — "us" still moves the
 * moment the caller names it explicitly, the way the owner's real list will.
 */
const DEFAULT_ONLY_EXCLUDED = new Set(["us"]);

/**
 * A placeholder until the owner sends the real list. Markets an English/USD
 * storefront is likely to sell into first, deliberately short: the point is a
 * working default for the stand, not a guess at the client's real footprint.
 */
export const DEFAULT_COUNTRIES = [
  "gb",
  "ca",
  "au",
  "nz",
  "de",
  "fr",
  "nl",
  "es",
  "it",
  "pl",
  "se",
  "no",
  "dk",
  "fi",
  "ch",
  "at",
  "ie",
  "ae",
  "sg",
  "il",
];

export type Args = {
  countries: string[] | null;
  name: string;
  dryRun: boolean;
};

export const parseArgs = (argv: string[]): Args => {
  const args: Args = { countries: null, name: "International", dryRun: false };

  for (const raw of argv) {
    const arg = raw.replace(/^--/, "");

    if (arg === "dry-run") {
      args.dryRun = true;
    } else if (arg.startsWith("countries=")) {
      args.countries = arg
        .slice("countries=".length)
        .split(",")
        .map((code) => code.trim().toLowerCase())
        .filter(Boolean);
    } else if (arg.startsWith("name=")) {
      args.name = arg.slice("name=".length);
    }
  }

  if (!args.countries && process.env.COUNTRIES) {
    args.countries = process.env.COUNTRIES.split(",")
      .map((code) => code.trim().toLowerCase())
      .filter(Boolean);
  }
  if (process.env.DRY_RUN === "true") {
    args.dryRun = true;
  }

  return args;
};

/**
 * What this run should request: the caller's explicit list (flag or
 * `COUNTRIES` env, already folded into `args.countries` by `parseArgs`)
 * unchanged, or `DEFAULT_COUNTRIES` with `DEFAULT_ONLY_EXCLUDED` stripped out
 * — a defensive second filter, since `DEFAULT_COUNTRIES` itself must never
 * carry "us" either.
 */
export const resolveRequestedCountries = (args: Pick<Args, "countries">): string[] => {
  if (args.countries) return args.countries;
  return DEFAULT_COUNTRIES.filter((code) => !DEFAULT_ONLY_EXCLUDED.has(code));
};

export type RegionRow = {
  id: string;
  name: string;
  currency_code: string;
  countries?: ({ iso_2?: string | null } | null)[] | null;
  payment_providers?: ({ id?: string | null } | null)[] | null;
};

export type RegionPlan = {
  /** Countries this run actually wants assigned to the target region. */
  wanted: string[];
  /** Countries dropped because they are on the protected list. */
  protected: string[];
  /** Per other-region moves: take these countries away, region ends up with `remaining`. */
  toFree: { region: RegionRow; countries: string[]; remaining: string[] }[];
  /** Full country list the target region should carry once this run is applied. */
  finalCountries: string[];
  /** The existing region by this name and currency, if there is one. */
  target: RegionRow | null;
  /** True when the target already has exactly `finalCountries` and the system default provider. */
  noopNeeded: boolean;
};

/**
 * The pure planning step: given every region on the backend and the countries
 * this run wants, decide what has to move and what the target region's final
 * country list and payment providers look like. No I/O, so this is what the
 * unit tests exercise directly.
 */
export const planRegionAssignment = (
  regions: RegionRow[],
  requested: string[],
  targetName: string,
): RegionPlan => {
  const seen = new Set<string>();
  const wanted: string[] = [];
  const dropped: string[] = [];

  for (const code of requested) {
    if (seen.has(code)) continue;
    seen.add(code);
    if (PROTECTED_COUNTRIES.has(code)) {
      dropped.push(code);
      continue;
    }
    wanted.push(code);
  }

  const ownerOf = new Map<string, RegionRow>();
  for (const region of regions) {
    for (const country of region.countries ?? []) {
      const code = country?.iso_2?.toLowerCase();
      if (code) ownerOf.set(code, region);
    }
  }

  const target =
    regions.find((region) => region.name === targetName && region.currency_code === REGION_CURRENCY) ?? null;

  const toFreeByRegion = new Map<string, { region: RegionRow; countries: Set<string> }>();
  for (const code of wanted) {
    const owner = ownerOf.get(code);
    if (owner && owner.id !== target?.id) {
      const entry = toFreeByRegion.get(owner.id) ?? { region: owner, countries: new Set<string>() };
      entry.countries.add(code);
      toFreeByRegion.set(owner.id, entry);
    }
  }

  const toFree = Array.from(toFreeByRegion.values()).map(({ region, countries }) => {
    const remaining = (region.countries ?? [])
      .map((c) => c?.iso_2?.toLowerCase())
      .filter((code): code is string => code !== undefined && !countries.has(code));
    return { region, countries: Array.from(countries), remaining };
  });

  const existingCountries = new Set(
    (target?.countries ?? [])
      .map((c) => c?.iso_2?.toLowerCase())
      .filter((c): c is string => Boolean(c)),
  );
  const finalCountries = Array.from(new Set([...existingCountries, ...wanted])).sort();

  const countriesAlreadyCorrect =
    existingCountries.size === finalCountries.length && finalCountries.every((c) => existingCountries.has(c));
  const hasSystemDefault = (target?.payment_providers ?? []).some(
    (provider) => provider?.id === SYSTEM_DEFAULT_PROVIDER_ID,
  );

  return {
    wanted,
    protected: dropped,
    toFree,
    finalCountries,
    target,
    noopNeeded: Boolean(target) && countriesAlreadyCorrect && hasSystemDefault,
  };
};

export default async function ensureInternationalRegion({
  container,
  args: execArgs,
}: {
  container: MedusaContainer;
  args?: string[];
}) {
  const logger: Logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const args = parseArgs(execArgs ?? []);
  const requested = resolveRequestedCountries(args);

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name", "currency_code", "countries.iso_2", "payment_providers.id"],
  });

  const plan = planRegionAssignment(regions as RegionRow[], requested, args.name);

  for (const code of plan.protected) {
    logger.warn(
      `ensure-international-region: "${code}" is protected and will never be moved into "${args.name}" — skipped.`,
    );
  }

  if (!plan.wanted.length) {
    logger.error("ensure-international-region: no countries left to assign after the protected list was removed.");
    return;
  }

  if (plan.noopNeeded) {
    logger.info(
      `ensure-international-region: "${args.name}" (${plan.target?.id}) already has every requested country ` +
        `(${plan.finalCountries.length}) and ${SYSTEM_DEFAULT_PROVIDER_ID} — nothing to do.`,
    );
    return;
  }

  for (const { region, countries, remaining } of plan.toFree) {
    logger.info(
      `ensure-international-region: moving ${countries.join(", ")} out of "${region.name}" (${region.id}), ` +
        `${remaining.length} ${remaining.length === 1 ? "country" : "countries"} left there.`,
    );
    if (!args.dryRun) {
      await updateRegionsWorkflow(container).run({
        input: { selector: { id: region.id }, update: { countries: remaining } },
      });
    }
  }

  if (!plan.target) {
    logger.info(
      `ensure-international-region: creating "${args.name}" (${REGION_CURRENCY}) with ${plan.finalCountries.length} countries.`,
    );
    if (!args.dryRun) {
      await createRegionsWorkflow(container).run({
        input: {
          regions: [
            {
              name: args.name,
              currency_code: REGION_CURRENCY,
              countries: plan.finalCountries,
              payment_providers: [SYSTEM_DEFAULT_PROVIDER_ID],
            },
          ],
        },
      });
    }
  } else {
    const currentProviders = (plan.target.payment_providers ?? [])
      .map((provider) => provider?.id)
      .filter((id): id is string => Boolean(id));
    const hasSystemDefault = currentProviders.includes(SYSTEM_DEFAULT_PROVIDER_ID);

    logger.info(
      `ensure-international-region: updating "${plan.target.name}" (${plan.target.id}) — countries ` +
        `${(plan.target.countries ?? []).length} -> ${plan.finalCountries.length}` +
        `${hasSystemDefault ? "" : `, +${SYSTEM_DEFAULT_PROVIDER_ID}`}.`,
    );
    if (!args.dryRun) {
      await updateRegionsWorkflow(container).run({
        input: {
          selector: { id: plan.target.id },
          update: {
            countries: plan.finalCountries,
            payment_providers: hasSystemDefault
              ? currentProviders
              : [...currentProviders, SYSTEM_DEFAULT_PROVIDER_ID],
          },
        },
      });
    }
  }

  logger.info(
    `ensure-international-region: done${args.dryRun ? " [dry-run]" : ""} — ${plan.finalCountries.length} ` +
      `countries in "${args.name}", ${plan.toFree.length} other region(s) touched.`,
  );
}
