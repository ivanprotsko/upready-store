/**
 * What the catalogue export and import need to know about the CALLER before
 * they can do anything: which products are the tenant's, which categories, and
 * which currencies its file may carry (t14-product-import).
 *
 * Kept next to the routes rather than inside `src/product-csv/` because it is
 * the only part of the feature that reads a request. Everything under
 * `src/product-csv/` takes a container and plain data, which is what makes it
 * unit-testable without booting the app.
 */

import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import { loadCatalogSnapshot, type CatalogSnapshot } from "../../../product-csv/catalog";
import { getTenantScope, listTenantCategoryIds, listTenantProductIds } from "../tenant-scope";
import type { TenantScope } from "../tenant-scope";

export type CsvContext = {
  tenant: TenantScope;
  tenant_admin_id: string;
  snapshot: CatalogSnapshot;
  /** Currencies the store prices in. A column in any other currency is fatal. */
  allowed_currencies: string[];
};

/**
 * The currencies of the store, and the one this shop prices in by default.
 *
 * The shop's own currency is derived, not stored, and the chain is the
 * storefront's own (b01-owner-numbers):
 *
 * 1. `tenant_locale_settings.default_country` — the owner's explicit pick on
 *    «Язык и валюта» (t06-locale-currency) — resolved through the Medusa
 *    region covering that country;
 * 2. else the shop's `default_locale` through this deployment's
 *    `LOCALE_COUNTRY_MAP` (`"ru:ru,en:us"`, the same variable
 *    `apps/storefront/src/lib/geolocation/locale-country.ts` reads), which is
 *    empty on a single-store stand and, measured 2026-09-15, is NOT set on
 *    `mt-backend` either — so on the live platform this step yields nothing;
 * 3. else `null`, and the currency is then taken from the catalogue itself:
 *    the one its own variants are actually priced in (`collectCurrencies` in
 *    `product-csv/catalog.ts`).
 *
 * The store's default currency is the LAST resort, never the first. The store
 * row is shared by every tenant of this platform and its default is `usd` from
 * the seed, which is how a shop selling in roubles was handed a file with one
 * column, «Цена, USD», carrying `18` for a product priced 1 084 ₽ on its own
 * storefront (q03 gap-recheck, 2026-09-15). The same reasoning already governs
 * the panel's price editor (`use-pricing-scope.tsx`, f09).
 */

/** `"ru:ru,en:us"` → `Map { "ru" => "ru", "en" => "us" }`. Junk entries are dropped, not thrown on. */
const parseLocaleCountryMap = (raw: string): Map<string, string> => {
  const map = new Map<string, string>();

  for (const pair of raw.split(",")) {
    const [locale, country] = pair.split(":").map((part) => part.trim().toLowerCase());

    if (!locale || !country) {
      continue;
    }

    map.set(locale, country);
  }

  return map;
};
const resolveCurrencies = async (
  req: AuthenticatedMedusaRequest,
  tenantId: string,
): Promise<{ allowed: string[]; preferred: string | null; storeDefault: string | null }> => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const { data: stores } = await query.graph({
    entity: "store",
    fields: ["id", "supported_currencies.currency_code", "supported_currencies.is_default"],
  });

  const supported = ((stores[0]?.supported_currencies ?? []) as {
    currency_code?: string | null;
    is_default?: boolean | null;
  }[]).filter((entry) => Boolean(entry?.currency_code));

  const allowed = supported.map((entry) => String(entry.currency_code).toLowerCase());
  const storeDefault =
    supported.find((entry) => entry.is_default)?.currency_code?.toLowerCase() ??
    allowed[0] ??
    null;

  const tenantModule: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  let country: string | null = null;

  try {
    const [settings] = await tenantModule.listTenantLocaleSettings({ tenant_id: tenantId });
    country = settings?.default_country ? String(settings.default_country).toLowerCase() : null;

    if (!country && settings?.default_locale) {
      const localeCountries = parseLocaleCountryMap(process.env.LOCALE_COUNTRY_MAP ?? "");
      country = localeCountries.get(String(settings.default_locale).toLowerCase()) ?? null;
    }
  } catch {
    country = null;
  }

  if (!country) {
    // Not "the store's default": the catalogue decides (step 3 above).
    return { allowed, preferred: null, storeDefault };
  }

  // `take: null` — the seed creates 241 regions and `query.graph` pages by
  // default, so a find() over the first page alone would miss Russia and drop
  // the shop back to the store's `usd`.
  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code", "countries.iso_2"],
    pagination: { take: null } as never,
  });

  const region = regions.find((candidate) =>
    ((candidate?.countries ?? []) as { iso_2?: string | null }[]).some(
      (entry) => String(entry?.iso_2 ?? "").toLowerCase() === country,
    ),
  );

  return {
    allowed,
    preferred: region?.currency_code ? String(region.currency_code).toLowerCase() : null,
    storeDefault,
  };
};

export const loadCsvContext = async (req: AuthenticatedMedusaRequest): Promise<CsvContext> => {
  const tenant = await getTenantScope(req);
  const [productIds, categoryIds] = await Promise.all([
    listTenantProductIds(req),
    listTenantCategoryIds(req),
  ]);

  const { allowed, preferred, storeDefault } = await resolveCurrencies(req, tenant.id);

  const snapshot = await loadCatalogSnapshot({
    container: req.scope,
    productIds,
    categoryIds,
    salesChannelId: tenant.sales_channel_id,
    defaultCurrency: preferred,
    fallbackCurrency: storeDefault,
  });

  return {
    tenant,
    tenant_admin_id: req.auth_context.actor_id,
    snapshot,
    allowed_currencies: allowed.length > 0 ? allowed : snapshot.currencies,
  };
};

/**
 * One of the tenant's own uploads, or a 404 worded like Medusa's own miss. A
 * row another tenant uploaded is a missing row here, the same rule
 * `assertOwnedProduct` follows.
 */
export const loadOwnImport = async (
  req: AuthenticatedMedusaRequest,
  importId: string,
  tenantId: string,
) => {
  const tenantModule: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const [row] = await tenantModule.listTenantProductImports({
    id: importId,
    tenant_id: tenantId,
  });

  if (!row) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Product import with id "${importId}" was not found`,
    );
  }

  return row;
};
