import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../../../modules/tenant";
import type TenantModuleService from "../../../../../modules/tenant/service";
import { DEFAULT_PAGE_LOCALE, toPageDto } from "../../../../tenants/pages/page-helpers";
import { resolveTenantFromPublishableKey } from "../../resolve-tenant";

/**
 * `GET /store/tenant/pages/:key` — one published section of the tenant behind
 * the storefront's key.
 *
 * Three different misses answer the same 404, on purpose: a key outside the
 * five, a key this tenant never saved, and a saved key still in draft. A
 * storefront visitor must not be able to tell a neighbour's page, an unwritten
 * page and an unpublished draft apart, which is the same reason `/tenants/*`
 * answers 404 for a foreign id (contract, "Ground rules").
 */
export const GET = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req);
  const key = req.params.key;
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const [row] = await tenantModuleService.listTenantPages({
    tenant_id: tenant.id,
    key,
    locale: DEFAULT_PAGE_LOCALE,
    published: true,
  });

  if (!row) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Page with key "${key}" was not found`);
  }

  res.json({ page: toPageDto(row) });
};
