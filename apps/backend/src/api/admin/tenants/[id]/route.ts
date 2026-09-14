import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError, mergeMetadata } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import deleteTenantWorkflow from "../../../../workflows/tenant/delete-tenant";
import updateTenantWorkflow from "../../../../workflows/tenant/update-tenant";
import { deriveArchivedAt, fetchTenantDetail } from "../helpers";
import type { DeleteAdminTenantParamsType, PostAdminTenantUpdateBody } from "../validators";

const tenantNotFound = (id: string) =>
  new MedusaError(MedusaError.Types.NOT_FOUND, `Tenant with id "${id}" was not found`);

/** `GET /admin/tenants/:id` (contract §3). Archived tenants are readable. */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await fetchTenantDetail(req.scope, req.params.id);
  res.status(200).json({ tenant });
};

/**
 * `POST /admin/tenants/:id` (contract §3). `handle` in the body is refused
 * by the validator's `strictObject` before this handler runs; `metadata.archived_at`
 * is refused by the validator's `refine`. `metadata` merges the Medusa way:
 * verified in `@medusajs/utils` 2.19.0 `dist/common/merge-metadata.js`, an
 * empty-string VALUE deletes a key, not `null` as the contract first assumed
 * (recorded in `.ai/progress-w1.md`) — this route keeps that real behavior
 * rather than reimplementing the contract's guess.
 */
export const POST = async (req: AuthenticatedMedusaRequest<PostAdminTenantUpdateBody>, res: MedusaResponse) => {
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const existing = await tenantModuleService.retrieveTenant(req.params.id).catch(() => null);

  if (!existing) {
    throw tenantNotFound(req.params.id);
  }

  const { name, metadata } = req.validatedBody;

  const nextMetadata =
    metadata === undefined
      ? ((existing.metadata as Record<string, unknown> | null) ?? null)
      : mergeMetadata((existing.metadata as Record<string, unknown>) ?? {}, metadata);

  await updateTenantWorkflow(req.scope).run({
    input: { id: req.params.id, name, metadata: nextMetadata },
  });

  const tenant = await fetchTenantDetail(req.scope, req.params.id);
  res.status(200).json({ tenant });
};

/**
 * `DELETE /admin/tenants/:id` (contract §3/§4). Idempotent: an already
 * archived tenant answers `200` again with its original `archived_at`
 * without re-running the workflow (so a repeated `purge_files=true` call
 * does not re-attempt a purge of files already gone).
 */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const existing = await tenantModuleService.retrieveTenant(req.params.id).catch(() => null);

  if (!existing) {
    throw tenantNotFound(req.params.id);
  }

  const alreadyArchivedAt = deriveArchivedAt(existing.metadata as Record<string, unknown> | null);

  if (alreadyArchivedAt) {
    res.status(200).json({
      id: existing.id,
      object: "tenant",
      deleted: true,
      archived_at: alreadyArchivedAt,
    });
    return;
  }

  const purgeFiles = (req.validatedQuery as DeleteAdminTenantParamsType | undefined)?.purge_files ?? false;

  const { result } = await deleteTenantWorkflow(req.scope).run({
    input: { id: req.params.id, purge_files: purgeFiles },
  });

  res.status(200).json({
    id: req.params.id,
    object: "tenant",
    deleted: true,
    archived_at: result.archived_at,
  });
};
