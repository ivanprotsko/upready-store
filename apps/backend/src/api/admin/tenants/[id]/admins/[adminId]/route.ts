import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../../../../modules/tenant";
import type TenantModuleService from "../../../../../../modules/tenant/service";
import removeTenantAdminWorkflow from "../../../../../../workflows/tenant/remove-tenant-admin";
import { updateTenantAdminByStaffWorkflow as updateTenantAdminWorkflow } from "../../../../../../workflows/tenant/update-tenant-admin";
import { isPlatformAdminEmail } from "../../../helpers";
import type { PostAdminTenantAdminUpdateBody } from "../../../validators";

const adminNotFound = (tenantId: string, adminId: string) =>
  new MedusaError(
    MedusaError.Types.NOT_FOUND,
    `Tenant admin "${adminId}" was not found on tenant "${tenantId}"`,
  );

/**
 * Resolves the admin and asserts it belongs to `:id`. A foreign admin is
 * answered exactly like a missing one (`404`), never `400`/`403`, the same
 * convention `src/api/tenants/tenant-scope.ts` documents for `/tenants/*`.
 */
const assertOwnedAdmin = async (
  tenantModuleService: TenantModuleService,
  tenantId: string,
  adminId: string,
) => {
  const admin = await tenantModuleService.retrieveTenantAdmin(adminId).catch(() => null);

  if (!admin || admin.tenant_id !== tenantId) {
    throw adminNotFound(tenantId, adminId);
  }

  return admin;
};

/** `POST /admin/tenants/:id/admins/:adminId` (contract §3). */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminTenantAdminUpdateBody>,
  res: MedusaResponse,
) => {
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);
  const admin = await assertOwnedAdmin(tenantModuleService, req.params.id, req.params.adminId);

  const { result } = await updateTenantAdminWorkflow(req.scope).run({
    input: {
      tenant_admin_id: admin.id,
      current_email: admin.email,
      ...req.validatedBody,
    },
  });

  res.status(200).json({
    admin: {
      id: result.id,
      email: result.email,
      first_name: result.first_name ?? null,
      last_name: result.last_name ?? null,
      created_at: result.created_at,
      updated_at: result.updated_at,
    },
  });
};

/**
 * `DELETE /admin/tenants/:id/admins/:adminId` (contract §3). The last REAL
 * admin of a tenant cannot be removed (`400`) — checked here, a plain
 * count, with nothing to compensate, rather than as a workflow step.
 *
 * `PLATFORM_ADMIN_EMAIL` (o25-platform-admin-all-shops) never counts
 * towards that guard in either direction: it holds a row in every shop, so
 * counting it would let a shop owner remove THEMSELVES and leave only the
 * platform row behind (real bug, review finding on PR #140) — and removing
 * the platform's OWN row is never blocked by it either, since that removal
 * never changes how many real admins the shop has.
 */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);
  const admin = await assertOwnedAdmin(tenantModuleService, req.params.id, req.params.adminId);

  if (!isPlatformAdminEmail(admin.email)) {
    const [rows] = await tenantModuleService.listAndCountTenantAdmins({ tenant_id: req.params.id });
    const realAdminsCount = rows.filter((row) => !isPlatformAdminEmail(row.email)).length;

    if (realAdminsCount <= 1) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Tenant "${req.params.id}" has only one admin left; it cannot be removed.`,
      );
    }
  }

  await removeTenantAdminWorkflow(req.scope).run({
    input: { tenant_admin_id: admin.id, email: admin.email },
  });

  res.status(200).json({ id: admin.id, object: "tenant_admin", deleted: true });
};
