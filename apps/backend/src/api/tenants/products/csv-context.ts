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
 * The shop's own currency is derived, not stored: `tenant_locale_settings.
 * default_country` names the country it sells in (t06-locale-currency), and the
 * Medusa region covering that country names the currency. A shop that has never
 * saved those settings falls back to the store's default currency, which is
 * exactly what its storefront shows today.
 */
const resolveCurrencies = async (
  req: AuthenticatedMedusaRequest,
  tenantId: string,
): Promise<{ allowed: string[]; preferred: string | null }> => {
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
  } catch {
    country = null;
  }

  if (!country) {
    return { allowed, preferred: storeDefault };
  }

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code", "countries.iso_2"],
  });

  const region = regions.find((candidate) =>
    ((candidate?.countries ?? []) as { iso_2?: string | null }[]).some(
      (entry) => String(entry?.iso_2 ?? "").toLowerCase() === country,
    ),
  );

  const preferred = region?.currency_code
    ? String(region.currency_code).toLowerCase()
    : storeDefault;

  return { allowed, preferred };
};

export const loadCsvContext = async (req: AuthenticatedMedusaRequest): Promise<CsvContext> => {
  const tenant = await getTenantScope(req);
  const [productIds, categoryIds] = await Promise.all([
    listTenantProductIds(req),
    listTenantCategoryIds(req),
  ]);

  const { allowed, preferred } = await resolveCurrencies(req, tenant.id);

  const snapshot = await loadCatalogSnapshot({
    container: req.scope,
    productIds,
    categoryIds,
    salesChannelId: tenant.sales_channel_id,
    defaultCurrency: preferred,
  });

  return {
    tenant,
    tenant_admin_id: req.auth_context.actor_id,
    snapshot,
    allowed_currencies: allowed.length > 0 ? allowed : preferred ? [preferred] : [],
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
