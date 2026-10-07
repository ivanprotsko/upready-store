import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import addTenantAdminWorkflow from "../../../workflows/tenant/add-tenant-admin";
import { getTenantAdminAccess } from "../tenant-admin-gate";
import type { PostTenantStaffCreateBody } from "../validators";
import { assertEmailHasNoIdentity, isPlatformRow } from "./staff-rules";
import { toStaffMember } from "./staff-member";

/**
 * `GET /tenants/staff` (t-2026-10-07-11): the logins of the caller's own shop.
 * The shop is the one the gate read off the caller's row, never a parameter.
 * The platform's row is left out: it is not the shop's staff.
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
  });
};

/**
 * `POST /tenants/staff`: the owner gives a person a login in her shop.
 *
 * Two refusals come before anything is written, both `400`:
 *
 *   - the email already has a login in THIS shop;
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

  const [taken] = await tenantModuleService.listTenantAdmins({ email, tenant_id: access.tenant_id });

  if (taken) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "A login with this email already exists in this shop.",
    );
  }

  await assertEmailHasNoIdentity(req.scope, email);

  const { result } = await addTenantAdminWorkflow(req.scope).run({
    input: { ...req.validatedBody, tenant_id: access.tenant_id },
  });

  res.status(201).json({ staff_member: toStaffMember(result, access.id) });
};
