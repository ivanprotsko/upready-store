import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import { TENANT_PAGE_KEYS } from "../../../../modules/tenant/models/tenant-page";
import { pickPageForLocale, requestedPageLocale } from "../../../tenants/pages/page-helpers";
import { resolveTenantFromPublishableKey } from "../resolve-tenant";

/**
 * `GET /store/tenant/pages` — the published pages of the storefront's own tenant,
 * for the footer's Information column: `{ pages: [{ key, title, locale }] }`.
 *
 * One entry per key in the visitor's locale (`x-medusa-locale` / `?locale=`),
 * falling back per `pickPageForLocale`. The storefront keys its fetch cache by
 * the `?locale=` it sends, so one language can no longer fill the cache for
 * every visitor (the reason the first version read `en` alone).
 *
 * Order is `TENANT_PAGE_KEYS`' own, not the database's, so the footer column
 * reads the same on every storefront.
 */
export const GET = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req);
  const requested = requestedPageLocale(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);
  const rows = await tenantModuleService.listTenantPages({
    tenant_id: tenant.id,
    published: true,
  });
  const pages = TENANT_PAGE_KEYS.map((key) => pickPageForLocale(rows.filter((row) => row.key === key), requested))
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .map((row) => ({ key: row.key, title: row.title, locale: row.locale }));
  res.json({ pages });
};
