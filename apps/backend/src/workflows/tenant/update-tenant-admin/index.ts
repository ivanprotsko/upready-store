import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import updateTenantAdminStep, {
  type UpdateTenantAdminStepInput,
} from "./steps/update-tenant-admin";
import updateTenantAdminPasswordStep from "./steps/update-tenant-admin-password";
import updateTenantAdminProfileStep from "./steps/update-tenant-admin-profile";

/**
 * Two workflows live here, because two namespaces edit a tenant admin and the
 * night's waves A and B wrote one file each at this path (merge 2026-09-11):
 *
 *   - `updateTenantAdminWorkflow` — the admin editing THEMSELVES from the
 *     tenant panel (`POST /tenants/me`, wave 2 piece 4).
 *   - `updateTenantAdminByStaffWorkflow` — platform staff editing someone
 *     else's admin (`POST /admin/tenants/:id/admins/:adminId`, contract §3).
 *
 * Their workflow ids MUST differ: Medusa registers workflows by that string,
 * so two `createWorkflow("update-tenant-admin", …)` calls in one process make
 * the second silently replace the first. The staff one is therefore registered
 * as `update-tenant-admin-by-staff`.
 */

export type UpdateTenantAdminWorkflowInput = UpdateTenantAdminStepInput;

const updateTenantAdminWorkflow = createWorkflow(
  "update-tenant-admin",
  (input: UpdateTenantAdminWorkflowInput) => {
    const tenantAdmin = updateTenantAdminStep(input);

    return new WorkflowResponse(tenantAdmin);
  },
);

export type UpdateTenantAdminByStaffWorkflowInput = {
  tenant_admin_id: string;
  /** The admin's email BEFORE this update, resolved by the route. */
  current_email: string;
  email?: string;
  password?: string;
  first_name?: string;
  last_name?: string;
};

/**
 * Order matters: the password step runs first, against `current_email` (the
 * emailpass provider identity's `entity_id` has not moved yet); the profile
 * step runs second and is the one that, if `email` is present, moves that
 * `entity_id` to the new address. Each step compensates independently.
 */
export const updateTenantAdminByStaffWorkflow = createWorkflow(
  "update-tenant-admin-by-staff",
  function (input: UpdateTenantAdminByStaffWorkflowInput) {
    updateTenantAdminPasswordStep({ email: input.current_email, password: input.password });

    const tenantAdmin = updateTenantAdminProfileStep({
      tenant_admin_id: input.tenant_admin_id,
      email: input.email,
      first_name: input.first_name,
      last_name: input.last_name,
    });

    return new WorkflowResponse(tenantAdmin);
  },
);

export default updateTenantAdminWorkflow;
