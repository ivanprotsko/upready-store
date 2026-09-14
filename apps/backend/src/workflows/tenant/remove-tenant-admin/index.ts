import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import deleteTenantAdminAuthIdentityStep from "./steps/delete-tenant-admin-auth-identity";
import deleteTenantAdminRowStep from "./steps/delete-tenant-admin-row";

export type RemoveTenantAdminWorkflowInput = {
  tenant_admin_id: string;
  /** The admin's email, resolved by the route before invoking this workflow. */
  email: string;
};

/**
 * `DELETE /admin/tenants/:id/admins/:adminId` (contract §3). The "last admin
 * cannot be removed" guard is the route's job (it already reads the
 * tenant's `admins_count` to answer `404` on a foreign admin, so it counts
 * there too) rather than a step here, because it is a read-only check with
 * nothing to compensate.
 */
const removeTenantAdminWorkflow = createWorkflow(
  "remove-tenant-admin",
  function (input: RemoveTenantAdminWorkflowInput) {
    deleteTenantAdminRowStep({ id: input.tenant_admin_id });
    deleteTenantAdminAuthIdentityStep({ email: input.email });

    const result = transform({ input }, (data) => ({
      id: data.input.tenant_admin_id,
      object: "tenant_admin" as const,
      deleted: true as const,
    }));

    return new WorkflowResponse(result);
  },
);

export default removeTenantAdminWorkflow;
