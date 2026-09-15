import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import { resolveTenantFromPublishableKey } from "../resolve-tenant";

/**
 * `GET /store/tenant/redirects` — the whole redirect table of the storefront's
 * own tenant, for the middleware (`lib/tenant/redirects.ts`) to match the
 * incoming pathname against before it does anything with locale
 * (t11-seo-redirects).
 *
 * Not paginated, same reasoning as `GET /tenants/redirects`: a shop's table is
 * a few dozen rows, one fetch per cache TTL, not a listing screen.
 */
export const GET = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const rows = await tenantModuleService.listTenantRedirects({ tenant_id: tenant.id });

  res.json({
    redirects: rows.map((row) => ({
      from_path: row.from_path,
      to_path: row.to_path,
      status_code: row.status_code,
    })),
  });
};
