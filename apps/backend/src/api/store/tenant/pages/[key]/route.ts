import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../../../modules/tenant";
import type TenantModuleService from "../../../../../modules/tenant/service";
import { pickPageForLocale, requestedPageLocale, toPageDto } from "../../../../tenants/pages/page-helpers";
import { resolveTenantFromPublishableKey } from "../../resolve-tenant";

/**
 * `GET /store/tenant/pages/:key` — one published page of the storefront's own
 * tenant, in the visitor's locale when that row exists, otherwise per the
 * fallback chain of `pickPageForLocale` (language part → `en` → any). A draft
 * or an unwritten key is a 404, the same answer for both, so the storefront
 * cannot tell an unpublished page from a missing one.
 */
export const GET = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req);
  const key = req.params.key;
  const requested = requestedPageLocale(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);
  const rows = await tenantModuleService.listTenantPages({
    tenant_id: tenant.id,
    key,
    published: true,
  });
  const row = pickPageForLocale(rows, requested);
  if (!row) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Page with key "${key}" was not found`);
  }
  res.json({ page: toPageDto(row) });
};
