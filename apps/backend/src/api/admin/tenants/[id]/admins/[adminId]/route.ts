import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../../../../modules/tenant";
import type TenantModuleService from "../../../../../../modules/tenant/service";
import removeTenantAdminWorkflow from "../../../../../../workflows/tenant/remove-tenant-admin";
import { updateTenantAdminByStaffWorkflow as updateTenantAdminWorkflow } from "../../../../../../workflows/tenant/update-tenant-admin";
import { assertAnotherOwnerStays } from "../../../../../tenants/staff/staff-rules";
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

/**
 * `POST /admin/tenants/:id/admins/:adminId` (contract §3). `role` can be
 * changed here too (t-2026-10-07-11), with the one refusal the shop's own
 * `POST /tenants/staff/:id` has: the last owner of a shop keeps the role.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminTenantAdminUpdateBody>,
  res: MedusaResponse,
) => {
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);
  const admin = await assertOwnedAdmin(tenantModuleService, req.params.id, req.params.adminId);
  const { role } = req.validatedBody;

  if (role !== undefined && role !== admin.role) {
    const rows = await tenantModuleService.listTenantAdmins({ tenant_id: req.params.id });
    assertAnotherOwnerStays(rows, admin, "demote");
  }

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
      role: result.role,
      created_at: result.created_at,
      updated_at: result.updated_at,
    },
  });
};

/**
 * `DELETE /admin/tenants/:id/admins/:adminId` (contract §3). The last REAL
 * owner of a tenant cannot be removed (`400`) — checked here, a plain
 * count, with nothing to compensate, rather than as a workflow step. Before
 * roles (t-2026-10-07-11) every login was an owner and this was «the last
 * admin»; a manager or an operator can always be removed.
 *
 * `PLATFORM_ADMIN_EMAIL` (o25-platform-admin-all-shops) never counts
 * towards that guard in either direction: it holds a row in every shop, so
 * counting it would let a shop owner remove THEMSELVES and leave only the
 * platform row behind (real bug, review finding on PR #140) — and removing
 * the platform's OWN row is never blocked by it either, since that removal
 * never changes how many real owners the shop has. The rule itself is
 * `assertAnotherOwnerStays`, shared with `DELETE /tenants/staff/:id`.
 */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);
  const admin = await assertOwnedAdmin(tenantModuleService, req.params.id, req.params.adminId);

  const rows = await tenantModuleService.listTenantAdmins({ tenant_id: req.params.id });
  assertAnotherOwnerStays(rows, admin, "remove");

  await removeTenantAdminWorkflow(req.scope).run({
    input: { tenant_admin_id: admin.id, email: admin.email },
  });

  res.status(200).json({ id: admin.id, object: "tenant_admin", deleted: true });
};
