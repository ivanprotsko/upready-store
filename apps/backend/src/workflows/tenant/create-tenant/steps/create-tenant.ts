import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { TENANT_MODULE } from "../../../../modules/tenant";
import TenantModuleService from "../../../../modules/tenant/service";

export type CreateTenantStepInput = {
  name: string;
  handle: string;
};

const createTenantStep = createStep(
  "create-tenant",
  async (tenantData: CreateTenantStepInput, { container }) => {
    const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

    const tenant = await tenantModuleService.createTenants(tenantData);

    return new StepResponse(tenant, tenant.id);
  },
  async (tenantId, { container }) => {
    if (!tenantId) {
      return;
    }

    const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

    await tenantModuleService.deleteTenants(tenantId);
  },
);

export default createTenantStep;
