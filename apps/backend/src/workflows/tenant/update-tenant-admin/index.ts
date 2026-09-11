import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import updateTenantAdminPasswordStep from "./steps/update-tenant-admin-password";
import updateTenantAdminProfileStep from "./steps/update-tenant-admin-profile";

export type UpdateTenantAdminWorkflowInput = {
  tenant_admin_id: string;
  /** The admin's email BEFORE this update, resolved by the route. */
  current_email: string;
  email?: string;
  password?: string;
  first_name?: string;
  last_name?: string;
};

/**
 * `POST /admin/tenants/:id/admins/:adminId` (contract §3). Order matters:
 * the password step runs first, against `current_email` (the emailpass
 * provider identity's `entity_id` has not moved yet); the profile step runs
 * second and is the one that, if `email` is present, moves that `entity_id`
 * to the new address. Each step compensates independently.
 */
const updateTenantAdminWorkflow = createWorkflow(
  "update-tenant-admin",
  function (input: UpdateTenantAdminWorkflowInput) {
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
