import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";

export type UpdateTenantStepInput = {
  id: string;
  name?: string;
  metadata: Record<string, unknown> | null;
};

type Compensation = { id: string; previousName: string; previousMetadata: Record<string, unknown> | null };

/**
 * `POST /admin/tenants/:id` (contract §3): name and/or the already-merged
 * `metadata` object. Kept as a step, not a direct
 * `tenantModuleService.updateTenants` call in the route, per this repo's
 * `@medusajs/no-service-mutations-in-api-route` lint rule. Compensation
 * restores both fields to what they were before this step ran.
 */
const updateTenantStep = createStep(
  "update-tenant",
  async (input: UpdateTenantStepInput, { container }) => {
    const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);
    const before = await tenantModuleService.retrieveTenant(input.id);

    await tenantModuleService.updateTenants({
      id: input.id,
      ...(input.name !== undefined ? { name: input.name } : {}),
      metadata: input.metadata,
    });

    const compensation: Compensation = {
      id: input.id,
      previousName: before.name,
      previousMetadata: (before.metadata as Record<string, unknown> | null) ?? null,
    };

    return new StepResponse({ id: input.id }, compensation);
  },
  async (compensation, { container }) => {
    if (!compensation) {
      return;
    }

    const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

    await tenantModuleService.updateTenants({
      id: compensation.id,
      name: compensation.previousName,
      metadata: compensation.previousMetadata,
    });
  },
);

export default updateTenantStep;
