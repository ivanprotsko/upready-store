import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";

export type UpdateTenantAdminStepInput = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Updates the caller's own `tenant_admin` row (`POST /tenants/me`). The
 * compensation restores the exact previous values read before the write, the
 * same shape `updateTenantAdmins` takes, so a rollback is itself just another
 * call to the same method.
 */
const updateTenantAdminStep = createStep(
  "update-tenant-admin",
  async (input: UpdateTenantAdminStepInput, { container }) => {
    const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

    const previous = await tenantModuleService.retrieveTenantAdmin(input.id, {
      select: ["id", "first_name", "last_name", "metadata"],
    });

    const updated = await tenantModuleService.updateTenantAdmins(input);

    return new StepResponse(updated, {
      id: previous.id,
      first_name: previous.first_name,
      last_name: previous.last_name,
      metadata: previous.metadata,
    });
  },
  async (previous, { container }) => {
    if (!previous) {
      return;
    }

    const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);
    await tenantModuleService.updateTenantAdmins(previous);
  },
);

export default updateTenantAdminStep;
