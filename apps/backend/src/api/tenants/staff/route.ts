import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import addTenantAdminWorkflow from "../../../workflows/tenant/add-tenant-admin";
import { permissionsOf, STAFF_ROLES } from "../permissions";
import { getTenantAdminAccess } from "../tenant-admin-gate";
import type { PostTenantStaffCreateBody } from "../validators";
import { assertEmailHasNoIdentity, isPlatformRow } from "./staff-rules";
import { toStaffMember } from "./staff-member";
import { STAFF_REFUSALS } from "./staff-refusals";

/**
 * `GET /tenants/staff` (t-2026-10-07-11): the logins of the caller's own shop.
 * The shop is the one the gate read off the caller's row, never a parameter.
 * The platform's row is left out: it is not the shop's staff.
 *
 * `roles` is every role the shop may give, with what it opens, in the order
 * owner, manager, operator (§12.3). The form that adds a login says what a
 * role sees from these names, so the panel keeps no text of its own about any
 * role. The platform's `developer` is not among them (t-2026-10-14-41): the
 * shop sees a developer's row in `staff` and never offers the role.
 *
 * Both routes here need the `staff` permission (`../permissions.ts`); the gate
 * has already checked it.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const access = getTenantAdminAccess(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const rows = await tenantModuleService.listTenantAdmins(
    { tenant_id: access.tenant_id },
    { order: { created_at: "ASC" } },
  );

  res.status(200).json({
    staff: rows.filter((row) => !isPlatformRow(row)).map((row) => toStaffMember(row, access.id)),
    roles: STAFF_ROLES.map((role) => ({ role, permissions: permissionsOf(role) })),
  });
};

/**
 * `POST /tenants/staff`: the owner gives a person a login in her shop.
 *
 * Two refusals come before anything is written, both `400`:
 *
 *   - the email already has a login in THIS shop, in any letter case: the
 *     email is what the shop switcher finds a person's shops by, so one shop
 *     never holds two rows that differ only by case;
 *   - the email already has an account anywhere on the platform
 *     (`assertEmailHasNoIdentity`): the owner cannot set a password for an
 *     account that is not hers to set one for.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostTenantStaffCreateBody>,
  res: MedusaResponse,
) => {
  const access = getTenantAdminAccess(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);
  const { email } = req.validatedBody;

  const rows = await tenantModuleService.listTenantAdmins({ tenant_id: access.tenant_id });

  if (rows.some((row) => row.email.toLowerCase() === email.toLowerCase())) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, STAFF_REFUSALS.email_taken_in_shop);
  }

  await assertEmailHasNoIdentity(req.scope, email);

  const { result } = await addTenantAdminWorkflow(req.scope).run({
    input: { ...req.validatedBody, tenant_id: access.tenant_id },
  });

  res.status(201).json({ staff_member: toStaffMember(result, access.id) });
};
