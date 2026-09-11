import { MedusaError, Modules } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import type { IAuthModuleService } from "@medusajs/framework/types";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";

export type UpdateTenantAdminProfileStepInput = {
  tenant_admin_id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
};

type Compensation = {
  tenant_admin_id: string;
  previous: { email: string; first_name: string | null; last_name: string | null };
  providerIdentityId?: string;
};

/**
 * Updates the `tenant_admin` row's email/first_name/last_name, and — when the
 * email changes — the emailpass provider identity's `entity_id` alongside it
 * (contract §3: "find it by `listAuthIdentities` filtering
 * `provider_identities.entity_id = old email` and `provider = "emailpass"`").
 * Runs AFTER `update-tenant-admin-password`, so `before.email` read here is
 * still the row's pre-change email regardless of whether the password step
 * ran.
 *
 * Compensation restores the row (email, first_name, last_name) and the
 * provider identity's `entity_id` to what this step read at the start.
 */
const updateTenantAdminProfileStep = createStep(
  "update-tenant-admin-profile",
  async (input: UpdateTenantAdminProfileStepInput, { container }) => {
    const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);
    const before = await tenantModuleService.retrieveTenantAdmin(input.tenant_admin_id);

    let providerIdentityId: string | undefined;

    if (input.email && input.email !== before.email) {
      const authModuleService: IAuthModuleService = container.resolve(Modules.AUTH);

      const [identity] = await authModuleService.listAuthIdentities(
        { provider_identities: { entity_id: before.email, provider: "emailpass" } },
        { relations: ["provider_identities"] },
      );

      const providerIdentity = identity?.provider_identities?.find(
        (candidate) => candidate.provider === "emailpass" && candidate.entity_id === before.email,
      );

      if (!providerIdentity) {
        throw new MedusaError(
          MedusaError.Types.NOT_FOUND,
          `Auth identity for tenant admin "${before.email}" was not found`,
        );
      }

      providerIdentityId = providerIdentity.id;

      await authModuleService.updateProviderIdentities({ id: providerIdentityId, entity_id: input.email });
    }

    const updateData: { id: string; email?: string; first_name?: string; last_name?: string } = {
      id: input.tenant_admin_id,
    };
    if (input.email !== undefined) updateData.email = input.email;
    if (input.first_name !== undefined) updateData.first_name = input.first_name;
    if (input.last_name !== undefined) updateData.last_name = input.last_name;

    const updated = await tenantModuleService.updateTenantAdmins(updateData);

    const compensation: Compensation = {
      tenant_admin_id: input.tenant_admin_id,
      previous: {
        email: before.email,
        first_name: before.first_name ?? null,
        last_name: before.last_name ?? null,
      },
      providerIdentityId,
    };

    return new StepResponse(updated, compensation);
  },
  async (compensation, { container }) => {
    if (!compensation) {
      return;
    }

    const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

    if (compensation.providerIdentityId) {
      const authModuleService: IAuthModuleService = container.resolve(Modules.AUTH);
      await authModuleService.updateProviderIdentities({
        id: compensation.providerIdentityId,
        entity_id: compensation.previous.email,
      });
    }

    await tenantModuleService.updateTenantAdmins({
      id: compensation.tenant_admin_id,
      email: compensation.previous.email,
      first_name: compensation.previous.first_name,
      last_name: compensation.previous.last_name,
    });
  },
);

export default updateTenantAdminProfileStep;
