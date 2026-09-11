import { MedusaError, Modules } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import type { IAuthModuleService } from "@medusajs/framework/types";

export type RegisterTenantAdminAuthIdentityStepInput = {
  email: string;
  password: string;
};

/**
 * Registers an emailpass auth identity for a tenant admin the platform staff
 * is creating directly (no prior `/auth/tenant/emailpass/register` call, the
 * way `POST /tenants` requires it). Mirrors `authModuleService.register`
 * verified in `@medusajs/auth` 2.19.0 (`dist/services/auth-module.js`):
 * `register(provider, { body: { email, password } })` returns
 * `{ success, authIdentity }` or `{ success: false, error }`, never throws.
 *
 * Compensated by deleting the identity, so a failure later in the workflow
 * (duplicate handle, warehouse provisioning, …) leaves no orphaned identity
 * behind. Shared by `create-tenant-by-admin` and `add-tenant-admin`.
 */
const registerTenantAdminAuthIdentityStep = createStep(
  "register-tenant-admin-auth-identity",
  async (input: RegisterTenantAdminAuthIdentityStepInput, { container }) => {
    const authModuleService: IAuthModuleService = container.resolve(Modules.AUTH);

    const result = await authModuleService.register("emailpass", {
      body: { email: input.email, password: input.password },
    });

    if (!result.success || !result.authIdentity) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        result.error ?? `Could not register the tenant admin "${input.email}".`,
      );
    }

    return new StepResponse({ id: result.authIdentity.id }, result.authIdentity.id);
  },
  async (authIdentityId, { container }) => {
    if (!authIdentityId) {
      return;
    }

    const authModuleService: IAuthModuleService = container.resolve(Modules.AUTH);

    await authModuleService.deleteAuthIdentities([authIdentityId]);
  },
);

export default registerTenantAdminAuthIdentityStep;
