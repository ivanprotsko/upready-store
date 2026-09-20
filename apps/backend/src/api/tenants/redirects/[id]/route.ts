import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import { getTenantScope } from "../../tenant-scope";
import type { PutTenantRedirectBody } from "../../validators";

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

/**
 * `PUT /tenants/redirects/:id` (b10-panel-gaps) — edits one rule in place. The
 * owner's own screen needs it: without it, fixing a typo in the target means
 * deleting the rule and typing the source path again, and the old address stops
 * redirecting in between.
 *
 * Only the fields the body names change. A new `from_path` is checked for a
 * collision the same way `POST` checks it, so two rules can never claim one
 * source path and make the outcome depend on read order.
 */
export const PUT = async (
  req: AuthenticatedMedusaRequest<PutTenantRedirectBody>,
  res: MedusaResponse,
) => {
  const scope = await getTenantScope(req);
  const { id } = req.params;
  const { from_path, to_path, status_code } = req.validatedBody;
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const [existing] = await tenantModuleService.listTenantRedirects({
    tenant_id: scope.id,
    id,
  });

  if (!existing) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Redirect with id "${id}" was not found`);
  }

  if (from_path && from_path !== existing.from_path) {
    const [clash] = await tenantModuleService.listTenantRedirects({
      tenant_id: scope.id,
      from_path,
    });

    if (clash) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Invalid request: a redirect from "${from_path}" already exists`,
      );
    }
  }

  const updated = await tenantModuleService.updateTenantRedirects({
    id,
    from_path: from_path ?? existing.from_path,
    to_path: to_path ?? existing.to_path,
    status_code: status_code ?? existing.status_code,
  });

  const row = Array.isArray(updated) ? updated[0] : updated;

  res.json({
    redirect: {
      id: row.id,
      from_path: row.from_path,
      to_path: row.to_path,
      status_code: row.status_code,
    },
  });
};
