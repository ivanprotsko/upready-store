import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";

export type CreateTenantDomainStepInput = {
  /** Already lowercased, port-stripped and shape-checked by the route's validator. */
  host: string;
  tenant_id: string;
};

/**
 * Writes one `tenant_domain` row (`POST /tenants/domains`, tenant-panel wave 2,
 * piece 9). The compensation deletes exactly the row this step created, by id,
 * so a rollback can never take a host the tenant already had.
 */
const createTenantDomainStep = createStep(
  "create-tenant-domain",
  async (input: CreateTenantDomainStepInput, { container }) => {
    const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

    const created = await tenantModuleService.createTenantDomains(input);

    return new StepResponse(created, created.id);
  },
  async (createdId, { container }) => {
    if (!createdId) {
      return;
    }

    const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);
    await tenantModuleService.deleteTenantDomains([createdId]);
  },
);

export default createTenantDomainStep;
