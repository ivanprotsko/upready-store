import { MedusaError, Modules } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import type { IAuthModuleService } from "@medusajs/framework/types";

export type UpdateTenantAdminPasswordStepInput = {
  /** The admin's CURRENT email, i.e. the emailpass provider identity's `entity_id`. */
  email: string;
  password?: string;
};

type Compensation = { providerIdentityId: string; previousProviderMetadata: Record<string, unknown> };

/**
 * Changes a tenant admin's password (contract §3: "password first, against
 * the OLD email"). `authModuleService.updateProvider("emailpass", { entity_id,
 * password })` needs `entity_id` = the CURRENT email (verified in
 * `@medusajs/auth-emailpass` 2.19.0 `dist/services/emailpass.js`, `update()`),
 * so this step must run before any email change.
 *
 * A no-op when `password` is absent. Compensation restores the exact
 * previous `provider_metadata` (the old password hash) via
 * `updateProviderIdentities`, rather than trying to re-derive it, which is
 * why the step reads and saves it before calling `updateProvider`.
 */
const updateTenantAdminPasswordStep = createStep(
  "update-tenant-admin-password",
  async (input: UpdateTenantAdminPasswordStepInput, { container }) => {
    if (!input.password) {
      return new StepResponse(null, null);
    }

    const authModuleService: IAuthModuleService = container.resolve(Modules.AUTH);

    const [identity] = await authModuleService.listAuthIdentities(
      { provider_identities: { entity_id: input.email, provider: "emailpass" } },
      { relations: ["provider_identities"] },
    );

    const providerIdentity = identity?.provider_identities?.find(
      (candidate) => candidate.provider === "emailpass" && candidate.entity_id === input.email,
    );

    if (!providerIdentity) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Auth identity for tenant admin "${input.email}" was not found`,
      );
    }

    const previousProviderMetadata = { ...(providerIdentity.provider_metadata ?? {}) };

    const result = await authModuleService.updateProvider("emailpass", {
      entity_id: input.email,
      password: input.password,
    });

    if (!result.success) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        result.error ?? `Could not update the password for "${input.email}".`,
      );
    }

    const compensation: Compensation = { providerIdentityId: providerIdentity.id, previousProviderMetadata };

    return new StepResponse(result, compensation);
  },
  async (compensation, { container }) => {
    if (!compensation) {
      return;
    }

    const authModuleService: IAuthModuleService = container.resolve(Modules.AUTH);

    await authModuleService.updateProviderIdentities({
      id: compensation.providerIdentityId,
      provider_metadata: compensation.previousProviderMetadata,
    });
  },
);

export default updateTenantAdminPasswordStep;
