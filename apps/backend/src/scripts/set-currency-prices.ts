import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { updateProductVariantsWorkflow } from "@medusajs/medusa/core-flows";
import { writeFileSync } from "node:fs";
import { pricePayload } from "../product-csv/apply";
import { readPrices, type CatalogPrice, type GraphPrice } from "../product-csv/catalog";

/**
 * Prices one tenant's catalogue in a second currency, computed from its RUB
 * price at a given rate (t-cherk-34: cherkashino.com sells in USD).
 *
 *   npx medusa exec ./src/scripts/set-currency-prices.ts \
 *     tenant=cherkashino currency=usd rate=95 [round=0.99|1] [dry-run] [report=<path>]
 *
 * The arguments carry no leading dashes because `medusa exec` parses the
 * command line itself and rejects a flag it does not know (measured on the
 * Medusa CLI 2.19, the same trap `backfill-product-attributes.ts` documents):
 * what reaches the script is the positional tail.
 *
 * `rate` is RUB per one unit of `currency`: the new price is
 * `rub_amount / rate`, then rounded (see `roundTargetAmount`).
 *
 * Hand-edit protection: every price this script writes is stamped into the
 * variant's own `metadata.script_prices.<currency>` (amount, rate, round,
 * written_at). A currency price row has no `metadata` of its own in
 * `@medusajs/pricing` (`models/price.js`: id, title, currency_code, amount,
 * quantities, rules, price_set, price_list — nothing else), so the mark lives
 * one level up, on the variant that owns it. On the next run:
 *
 * - no stamp and no price in that currency yet -> create it;
 * - no stamp but a price already there -> somebody else put it there (a hand
 *   edit through the Admin, or the seed); it is left alone;
 * - a stamp whose amount matches the live price -> the script's own last
 *   write is still intact, safe to recompute and overwrite;
 * - a stamp whose amount does NOT match the live price -> the owner changed
 *   it since; left alone, same as a price the script never touched.
 *
 * Every other currency a variant carries (and every price list it belongs to,
 * `in_price_list: true`) rides through `pricePayload` unchanged: `updatePriceSets`
 * deletes every unscoped price of the set absent from the update, so sending
 * only the touched currency would wipe the rest (`product-csv/catalog.ts`).
 *
 * Idempotent: a second run with the same `rate` and `round` changes nothing.
 */

export type RoundMode = "0.99" | "1" | null;

export type Args = {
  tenantHandle: string | null;
  currency: string | null;
  rate: number | null;
  round: RoundMode;
  sourceCurrency: string;
  dryRun: boolean;
  reportPath: string | null;
};

export const parseArgs = (argv: string[]): Args => {
  const args: Args = {
    tenantHandle: null,
    currency: null,
    rate: null,
    round: null,
    sourceCurrency: "rub",
    dryRun: false,
    reportPath: null,
  };

  for (const raw of argv) {
    // A leading `--` never reaches here through `medusa exec`, but a caller
    // who runs the compiled file directly writes one out of habit.
    const arg = raw.replace(/^--/, "");

    if (arg === "dry-run") {
      args.dryRun = true;
    } else if (arg.startsWith("report=")) {
      args.reportPath = arg.slice("report=".length);
    } else if (arg.startsWith("tenant=") || arg.startsWith("handle=")) {
      args.tenantHandle = arg.slice(arg.indexOf("=") + 1);
    } else if (arg.startsWith("currency=")) {
      args.currency = arg.slice("currency=".length).trim().toLowerCase();
    } else if (arg.startsWith("from=") || arg.startsWith("source=")) {
      args.sourceCurrency = arg.slice(arg.indexOf("=") + 1).trim().toLowerCase();
    } else if (arg.startsWith("rate=")) {
      const value = Number(arg.slice("rate=".length));
      args.rate = Number.isFinite(value) && value > 0 ? value : null;
    } else if (arg.startsWith("round=")) {
      const value = arg.slice("round=".length).trim();
      args.round = value === "0.99" || value === "1" ? value : null;
    } else if (!arg.includes("=") && !args.tenantHandle) {
      args.tenantHandle = arg;
    }
  }

  if (!args.tenantHandle) {
    args.tenantHandle = process.env.TENANT_HANDLE ?? null;
  }
  if (!args.currency && process.env.CURRENCY) {
    args.currency = process.env.CURRENCY.trim().toLowerCase();
  }
  if (args.rate === null && process.env.RATE) {
    const value = Number(process.env.RATE);
    args.rate = Number.isFinite(value) && value > 0 ? value : null;
  }
  if (!args.round && (process.env.ROUND === "0.99" || process.env.ROUND === "1")) {
    args.round = process.env.ROUND;
  }
  if (process.env.DRY_RUN === "true") {
    args.dryRun = true;
  }
  if (!args.reportPath && process.env.REPORT_PATH) {
    args.reportPath = process.env.REPORT_PATH;
  }

  return args;
};

/**
 * `rubAmount / rate`, then:
 *
 * - `round: "1"` to the nearest whole unit;
 * - `round: "0.99"` to the nearest whole unit, floored at 1, minus one cent
 *   (charm pricing — never below 0.99 for anything that costs something);
 * - no `round` to the nearest cent, so the stored amount is never a
 *   seventeen-digit float.
 *
 * A zero or negative source price (a free sample, a data error) stays 0
 * regardless of `round`, rather than coming out at -0.01.
 */
export const roundTargetAmount = (rubAmount: number, rate: number, round: RoundMode): number => {
  if (!(rubAmount > 0) || !(rate > 0)) {
    return 0;
  }

  const raw = rubAmount / rate;

  if (round === "1") {
    return Math.max(1, Math.round(raw));
  }

  if (round === "0.99") {
    const whole = Math.max(1, Math.round(raw));
    return Math.round(whole * 100 - 1) / 100;
  }

  return Math.round(raw * 100) / 100;
};

const AMOUNT_EPSILON = 1e-6;
const sameAmount = (a: number, b: number): boolean => Math.abs(a - b) < AMOUNT_EPSILON;

export type ScriptPriceStamp = {
  amount: number;
  rate: number;
  round: RoundMode;
  written_at: string;
};

export type VariantMetadata = Record<string, unknown> & {
  script_prices?: Record<string, ScriptPriceStamp>;
};

/**
 * Whether the variant's current price in `currency` can be overwritten.
 *
 * `undefined` current means there is no unconditional price in that currency
 * yet, so there is nothing to protect — always writable. A current price with
 * no stamp, or a stamp whose amount drifted from what is actually stored, was
 * last touched by something other than this exact script run and is left
 * alone.
 */
export const canOverwrite = (
  current: number | undefined,
  stamp: ScriptPriceStamp | undefined,
): boolean => {
  if (current === undefined) {
    return true;
  }
  if (!stamp) {
    return false;
  }
  return sameAmount(current, stamp.amount);
};

export const mergeScriptPriceMetadata = (
  metadata: Record<string, unknown> | null | undefined,
  currency: string,
  stamp: ScriptPriceStamp,
): Record<string, unknown> => {
  const existing = (metadata ?? {}) as VariantMetadata;
  return {
    ...existing,
    script_prices: {
      ...(existing.script_prices ?? {}),
      [currency]: stamp,
    },
  };
};

type VariantRow = {
  id: string;
  sku: string | null;
  metadata: Record<string, unknown> | null;
  price_set?: { prices?: GraphPrice[] | null } | null;
};

type ProductRow = {
  id: string;
  handle: string;
  variants?: VariantRow[] | null;
};

const unconditional = (rows: CatalogPrice[], currency: string): CatalogPrice | undefined =>
  rows.find((row) => row.currency_code === currency && !row.has_rules && !row.in_price_list);

export default async function setCurrencyPrices({
  container,
  args: execArgs,
}: {
  container: MedusaContainer;
  args?: string[];
}) {
  const logger: Logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const args = parseArgs(execArgs ?? []);

  if (!args.tenantHandle) {
    logger.error(
      "set-currency-prices: the shop handle is required — pass it as tenant=<handle> or TENANT_HANDLE.",
    );
    return;
  }
  if (!args.currency) {
    logger.error("set-currency-prices: currency=<code> is required.");
    return;
  }
  if (!args.rate) {
    logger.error("set-currency-prices: rate=<RUB per unit of currency>, a positive number, is required.");
    return;
  }
  if (args.currency === args.sourceCurrency) {
    logger.error(
      `set-currency-prices: currency and source (${args.sourceCurrency}) must differ.`,
    );
    return;
  }

  const {
    data: [tenant],
  } = await query.graph({
    entity: "tenant",
    fields: ["id", "handle", "name", "products.id"],
    filters: { handle: args.tenantHandle },
  });

  if (!tenant?.id) {
    logger.error(`set-currency-prices: no shop with handle "${args.tenantHandle}".`);
    return;
  }

  const productIds = ((tenant.products ?? []) as ({ id?: string | null } | null)[])
    .map((product) => product?.id ?? null)
    .filter((id): id is string => Boolean(id));

  if (!productIds.length) {
    logger.warn(`set-currency-prices: shop "${tenant.handle}" has no products linked to it.`);
    return;
  }

  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "handle",
      "variants.id",
      "variants.sku",
      "variants.metadata",
      "variants.price_set.prices.id",
      "variants.price_set.prices.amount",
      "variants.price_set.prices.currency_code",
      "variants.price_set.prices.price_list_id",
      "variants.price_set.prices.price_rules.attribute",
    ],
    filters: { id: productIds },
  });

  const report = {
    tenant: { id: tenant.id as string, handle: tenant.handle as string, name: tenant.name as string },
    currency: args.currency,
    source_currency: args.sourceCurrency,
    rate: args.rate,
    round: args.round,
    dry_run: args.dryRun,
    variants_total: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    kept_hand_edited: [] as { handle: string; sku: string | null; current: number; computed: number }[],
    no_source_price: [] as { handle: string; sku: string | null }[],
  };

  for (const raw of products as ProductRow[]) {
    for (const variant of raw.variants ?? []) {
      report.variants_total += 1;

      const { rows, byCurrency } = readPrices(variant.price_set?.prices ?? []);
      const sourceAmount = byCurrency[args.sourceCurrency];

      if (sourceAmount === undefined) {
        report.no_source_price.push({ handle: raw.handle, sku: variant.sku });
        continue;
      }

      const desired = roundTargetAmount(sourceAmount, args.rate, args.round);
      const current = unconditional(rows, args.currency);
      const metadata = (variant.metadata ?? null) as VariantMetadata | null;
      const stamp = metadata?.script_prices?.[args.currency];

      if (current && !canOverwrite(current.amount, stamp)) {
        report.kept_hand_edited.push({
          handle: raw.handle,
          sku: variant.sku,
          current: current.amount,
          computed: desired,
        });
        continue;
      }

      // `canOverwrite` already proved that a defined `current` carries a stamp
      // matching its own live amount, so comparing `current` to `desired` is
      // enough to tell a true no-op from a rate change.
      if (current && sameAmount(current.amount, desired)) {
        report.unchanged += 1;
        continue;
      }

      if (current) {
        report.updated += 1;
      } else {
        report.created += 1;
      }

      logger.info(
        `set-currency-prices: ${raw.handle} (${variant.sku ?? variant.id}) — ${args.currency.toUpperCase()} ` +
          `${current ? current.amount : "none"} -> ${desired}`,
      );

      if (args.dryRun) {
        continue;
      }

      const newStamp: ScriptPriceStamp = {
        amount: desired,
        rate: args.rate,
        round: args.round,
        written_at: new Date().toISOString(),
      };

      await updateProductVariantsWorkflow(container).run({
        input: {
          selector: { id: variant.id },
          update: {
            prices: pricePayload({ price_rows: rows } as never, {
              [args.currency]: desired,
            }) as never,
            metadata: mergeScriptPriceMetadata(variant.metadata, args.currency, newStamp),
          },
        },
      });
    }
  }

  const line = (label: string, value: unknown) => logger.info(`  ${label}: ${String(value)}`);

  logger.info(
    `set-currency-prices: shop "${tenant.handle}" — ${args.currency.toUpperCase()} from ${args.sourceCurrency.toUpperCase()} at rate ${args.rate}${args.round ? `, round ${args.round}` : ""}${args.dryRun ? " [dry-run]" : ""}`,
  );
  line("variants", report.variants_total);
  line("created", report.created);
  line("updated", report.updated);
  line("unchanged", report.unchanged);
  line("kept as hand-edited", report.kept_hand_edited.length);
  line(`no ${args.sourceCurrency.toUpperCase()} price to convert from`, report.no_source_price.length);

  if (args.reportPath) {
    writeFileSync(args.reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    line("report", args.reportPath);
  }
}
