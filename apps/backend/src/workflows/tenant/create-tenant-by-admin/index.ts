import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import createTenantWorkflow from "../create-tenant";
import registerTenantAdminAuthIdentityStep from "./steps/register-tenant-admin-auth-identity";

export type CreateTenantByAdminWorkflowInput = {
  name: string;
  handle: string;
  admin: {
    email: string;
    password: string;
    first_name?: string;
    last_name?: string;
  };
};

/**
 * `POST /admin/tenants` (contract §3): platform staff creates a tenant and
 * its first admin in one call, with a password, unlike `POST /tenants` which
 * expects the admin to have already gone through
 * `/auth/tenant/emailpass/register`. This workflow supplies that missing
 * step (`registerTenantAdminAuthIdentityStep`) and then runs the existing
 * `createTenantWorkflow` as a sub-step, so the two entry points share every
 * step after registration (sales channel, publishable key, warehouse, the
 * tenant row, the tenant_admin row, `setAuthAppMetadataStep`) and their
 * compensations.
 */
const createTenantByAdminWorkflow = createWorkflow(
  "create-tenant-by-admin",
  function (input: CreateTenantByAdminWorkflowInput) {
    const authIdentity = registerTenantAdminAuthIdentityStep({
      email: input.admin.email,
      password: input.admin.password,
    });

    const tenantInput = transform({ input, authIdentity }, (data) => ({
      name: data.input.name,
      handle: data.input.handle,
      admin: {
        email: data.input.admin.email,
        first_name: data.input.admin.first_name,
        last_name: data.input.admin.last_name,
      },
      authIdentityId: data.authIdentity.id,
    }));

    const tenant = createTenantWorkflow.runAsStep({ input: tenantInput });

    return new WorkflowResponse(tenant);
  },
);

export default createTenantByAdminWorkflow;
