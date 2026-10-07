import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import removeTenantAdminWorkflow from "../../../../workflows/tenant/remove-tenant-admin";
import { updateTenantAdminByStaffWorkflow } from "../../../../workflows/tenant/update-tenant-admin";
import { getTenantAdminAccess } from "../../tenant-admin-gate";
import type { PostTenantStaffUpdateBody } from "../../validators";
import { toStaffMember } from "../staff-member";
import { assertAnotherOwnerStays, assertPasswordIsThisShopsOnly, isPlatformRow } from "../staff-rules";

const invalid = (message: string) => new MedusaError(MedusaError.Types.INVALID_DATA, message);

/**
 * The login `:id` of the caller's own shop. A login of another shop and the
 * platform's row in this one are answered exactly like a missing id (`404`),
 * the convention `../../tenant-scope.ts` documents: the response never says
 * that a row exists where the caller may not see it.
 */
const retrieveStaffRow = async (tenantModuleService: TenantModuleService, tenantId: string, id: string) => {
  const row = await tenantModuleService.retrieveTenantAdmin(id).catch(() => null);

  if (!row || row.tenant_id !== tenantId || isPlatformRow(row)) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Staff member "${id}" was not found.`);
  }

  return row;
};

/**
 * `POST /tenants/staff/:id` (t-2026-10-07-11): name, role and password of one
 * login. Refused with `400`, before anything is written:
 *
 *   - the caller changing her own role (she could lock herself out of this
 *     very screen, and a second owner can do it for her);
 *   - taking `owner` away from the last owner of the shop;
 *   - a new password for a login that is also used outside this shop
 *     (`assertPasswordIsThisShopsOnly`).
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostTenantStaffUpdateBody>,
  res: MedusaResponse,
) => {
  const access = getTenantAdminAccess(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);
  const target = await retrieveStaffRow(tenantModuleService, access.tenant_id, req.params.id);
  const { role, password, first_name, last_name } = req.validatedBody;

  if (role !== undefined && role !== target.role) {
    if (target.id === access.id) {
      throw invalid("You cannot change your own role. Another owner of the shop can do it.");
    }

    const rows = await tenantModuleService.listTenantAdmins({ tenant_id: access.tenant_id });
    assertAnotherOwnerStays(rows, target, "demote");
  }

  if (password !== undefined) {
    await assertPasswordIsThisShopsOnly(req.scope, target);
  }

  const { result } = await updateTenantAdminByStaffWorkflow(req.scope).run({
    input: {
      tenant_admin_id: target.id,
      current_email: target.email,
      role,
      password,
      first_name,
      last_name,
    },
  });

  res.status(200).json({ staff_member: toStaffMember(result, access.id) });
};

/**
 * `DELETE /tenants/staff/:id`. Refused with `400`: the caller's own login, and
 * the last owner of the shop. What happens to the identity behind the login
 * is `removeTenantAdminWorkflow`'s rule: it is deleted only when nothing else
 * uses it.
 */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const access = getTenantAdminAccess(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);
  const target = await retrieveStaffRow(tenantModuleService, access.tenant_id, req.params.id);

  if (target.id === access.id) {
    throw invalid("You cannot remove your own login. Another owner of the shop can do it.");
  }

  const rows = await tenantModuleService.listTenantAdmins({ tenant_id: access.tenant_id });
  assertAnotherOwnerStays(rows, target, "remove");

  await removeTenantAdminWorkflow(req.scope).run({
    input: { tenant_admin_id: target.id, email: target.email },
  });

  res.status(200).json({ id: target.id, object: "tenant_admin", deleted: true });
};
