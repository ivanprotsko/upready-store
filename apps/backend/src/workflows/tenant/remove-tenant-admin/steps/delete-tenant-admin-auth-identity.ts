import { Modules } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import type { IAuthModuleService } from "@medusajs/framework/types";

export type DeleteTenantAdminAuthIdentityStepInput = { email: string };

/**
 * Deletes the emailpass auth identity behind a tenant admin's email. No
 * compensation is possible for a deleted identity (the password hash is
 * gone with it), which is why `removeTenantAdminWorkflow` runs this step
 * last, after the `tenant_admin` row (which CAN be restored) is already
 * gone.
 */
const deleteTenantAdminAuthIdentityStep = createStep(
  "delete-tenant-admin-auth-identity",
  async (input: DeleteTenantAdminAuthIdentityStepInput, { container }) => {
    const authModuleService: IAuthModuleService = container.resolve(Modules.AUTH);

    const [identity] = await authModuleService.listAuthIdentities({
      provider_identities: { entity_id: input.email, provider: "emailpass" },
    });

    if (identity) {
      await authModuleService.deleteAuthIdentities([identity.id]);
    }

    return new StepResponse({ deleted: Boolean(identity) });
  },
);

export default deleteTenantAdminAuthIdentityStep;
