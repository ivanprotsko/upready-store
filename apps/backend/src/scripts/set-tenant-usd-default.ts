import type { ExecArgs, Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";
import upsertTenantLocaleSettingsWorkflow from "../workflows/tenant/upsert-tenant-locale-settings";

/**
 * «На сайте цена в долларах по умолчанию» (t-cherk-com-hotfix batch 6, item 7,
 * Ivan 03.10). The mechanism is `tenant_locale_settings.default_country`
 * (t06-locale-currency): the storefront middleware maps the tenant's default
 * LOCALE to this country before geolocation runs (`middleware.ts`'s
 * `tenantLocaleCountryMap`), and the country decides the Medusa region, and
 * the region's currency is what the buyer sees first. A visitor who already
 * chose a country (cookie) or switches later keeps picking whatever they want
 * — this only sets the SHOP's own starting point, same as the courses already
 * sold on `/en/products/...` would price in.
 *
 * On THIS backend "us" is already its own single-country region, currency
 * `usd` (`migration-scripts/data/regions/json/us.json`, the dtc-starter seed:
 * one region per ISO country). So the whole fix is ONE field on ONE tenant's
 * own row — no region is created, merged or reassigned, and no other shop's
 * region is touched. The script still checks the region exists and prices in
 * USD before writing, so a backend where that seed never ran fails loudly
 * instead of silently pointing a shop at a region with no USD prices.
 *
 * `default_locale` and `enabled_locales` are read from the shop's current row
 * (or default to `["ru"]` / `"ru"` for a shop that never saved locale settings
 * — the same default this deployment already serves) and written back
 * UNCHANGED: this script touches `default_country` only, never the shop's
 * language.
 *
 *   npx medusa exec ./src/scripts/set-tenant-usd-default.js tenant=<handle>          (prints the plan, writes nothing)
 *   npx medusa exec ./src/scripts/set-tenant-usd-default.js tenant=<handle> apply    (writes)
 *   live: docker exec mt-backend node_modules/.bin/medusa exec ./src/scripts/set-tenant-usd-default.js tenant=cherkashino-com apply
 *
 * Idempotent: a second run changes nothing once `default_country` is already
 * the target country.
 */
const TARGET_COUNTRY = "us";

const readArg = (args: string[], name: string): string | undefined =>
  args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);

export default async function setTenantUsdDefault({ container, args = [] }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const apply = args.includes("apply");
  const handle = readArg(args, "tenant");

  if (!handle) {
    throw new Error("set-tenant-usd-default: pass tenant=<handle> (and apply to write)");
  }

  const {
    data: [tenant],
  } = await query.graph({ entity: "tenant", fields: ["id", "handle"], filters: { handle } });

  if (!tenant) {
    throw new Error(`set-tenant-usd-default: tenant "${handle}" was not found`);
  }

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name", "currency_code", "countries.iso_2"],
    filters: { countries: { iso_2: TARGET_COUNTRY } },
  });
  const usdRegion = (regions as { currency_code: string; name: string }[]).find(
    (region) => region.currency_code === "usd",
  );

  if (!usdRegion) {
    throw new Error(
      `set-tenant-usd-default: no USD region owns country "${TARGET_COUNTRY}" on this backend — the regions seed is missing or was changed. Not touching any region here; fix the seed or point this script at a different country.`,
    );
  }

  const tenantModuleService = container.resolve<TenantModuleService>(TENANT_MODULE);
  const [current] = await tenantModuleService.listTenantLocaleSettings({ tenant_id: tenant.id as string });

  const defaultLocale = current?.default_locale ?? "ru";
  const enabledLocales = (current?.enabled_locales as unknown as string[] | undefined) ?? ["ru"];
  const currentCountry = current?.default_country ?? null;

  logger.info(
    `set-tenant-usd-default: ${handle} — locale "${defaultLocale}" (enabled: ${enabledLocales.join(", ")}), default_country "${currentCountry ?? "(none)"}" -> "${TARGET_COUNTRY}" (region "${usdRegion.name}", usd)`,
  );

  if (currentCountry === TARGET_COUNTRY) {
    logger.info(`set-tenant-usd-default: ${handle} already defaults to "${TARGET_COUNTRY}", nothing to do`);
    return;
  }

  if (!apply) {
    logger.info("set-tenant-usd-default: dry run, nothing written; pass apply to write");
    return;
  }

  await upsertTenantLocaleSettingsWorkflow(container).run({
    input: {
      tenant_id: tenant.id as string,
      default_locale: defaultLocale,
      enabled_locales: enabledLocales,
      default_country: TARGET_COUNTRY,
    },
  });

  logger.info(`set-tenant-usd-default: ${handle} now defaults to "${TARGET_COUNTRY}" (usd)`);
}
