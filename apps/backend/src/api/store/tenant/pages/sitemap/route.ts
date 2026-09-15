import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { TENANT_MODULE } from "../../../../../modules/tenant";
import type TenantModuleService from "../../../../../modules/tenant/service";
import { resolveTenantFromPublishableKey } from "../../resolve-tenant";

/**
 * `GET /store/tenant/pages/sitemap` (t11-seo-redirects step 3) — every
 * published page of this tenant, one row per locale, for `app/sitemap.ts` to
 * list. Unlike `GET /store/tenant/pages` (footer-linked pages only, one per
 * key in the visitor's locale), this is unfiltered by `in_footer` and carries
 * every locale a page was saved in, because a sitemap lists every indexable
 * URL, not just the ones the footer shows.
 */
export const GET = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const rows = await tenantModuleService.listTenantPages({
    tenant_id: tenant.id,
    published: true,
  });

  res.json({
    pages: rows.map((row) => ({
      key: row.key,
      locale: row.locale,
      updated_at: row.updated_at,
    })),
  });
};
