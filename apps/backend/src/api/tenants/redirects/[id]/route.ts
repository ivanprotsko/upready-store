import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import { getTenantScope } from "../../tenant-scope";

/**
 * `DELETE /tenants/redirects/:id` — removes one manual redirect. A foreign or
 * unknown id is a 404 with the same wording, so the response never confirms
 * another tenant's row exists.
 */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const { id } = req.params;
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const [existing] = await tenantModuleService.listTenantRedirects({
    tenant_id: scope.id,
    id,
  });

  if (!existing) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Redirect with id "${id}" was not found`);
  }

  await tenantModuleService.deleteTenantRedirects([id]);

  res.json({ id, object: "tenant_redirect", deleted: true });
};
