import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { setAuthAppMetadataStep } from "@medusajs/medusa/core-flows";
import { TENANT_ACTOR_TYPE } from "../../../modules/tenant";
import type { TenantAdminRole } from "../../../modules/tenant/models/tenant-admin";
import createTenantAdminStep from "../create-tenant/steps/create-tenant-admin";
import registerTenantAdminAuthIdentityStep from "../create-tenant-by-admin/steps/register-tenant-admin-auth-identity";

export type AddTenantAdminWorkflowInput = {
  tenant_id: string;
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  /** Left out, the login is an `owner`, as every login was before roles (t-2026-10-07-11). */
  role?: TenantAdminRole;
};

/**
 * `POST /admin/tenants/:id/admins` (contract §3) and `POST /tenants/staff`
 * (t-2026-10-07-11): registers a second (or later) admin for an existing
 * tenant. Reuses `registerTenantAdminAuthIdentityStep`
 * (create-tenant-by-admin) for the auth identity and `createTenantAdminStep`
 * (create-tenant) for the `tenant_admin` row, so a duplicate email fails at
 * the same step with the same compensation either workflow already proves:
 * the identity registered first is deleted if the row insert fails.
 */
const addTenantAdminWorkflow = createWorkflow(
  "add-tenant-admin",
  function (input: AddTenantAdminWorkflowInput) {
    const authIdentity = registerTenantAdminAuthIdentityStep({
      email: input.email,
      password: input.password,
    });

    const tenantAdmin = createTenantAdminStep({
      email: input.email,
      first_name: input.first_name,
      last_name: input.last_name,
      role: input.role,
      tenant_id: input.tenant_id,
    });

    setAuthAppMetadataStep({
      authIdentityId: authIdentity.id,
      actorType: TENANT_ACTOR_TYPE,
      value: tenantAdmin.id,
    });

    return new WorkflowResponse(tenantAdmin);
  },
);

export default addTenantAdminWorkflow;
