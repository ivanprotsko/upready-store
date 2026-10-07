import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type { TenantAdminRole } from "../../../../modules/tenant/models/tenant-admin";
import TenantModuleService from "../../../../modules/tenant/service";

export type CreateTenantAdminStepInput = {
  email: string;
  first_name?: string;
  last_name?: string;
  /** Left out, the row takes the column's default, `owner`: the first login of a shop is its owner. */
  role?: TenantAdminRole;
  tenant_id: string;
};

const createTenantAdminStep = createStep(
  "create-tenant-admin",
  async (adminData: CreateTenantAdminStepInput, { container }) => {
    const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

    const tenantAdmin = await tenantModuleService.createTenantAdmins(adminData);

    return new StepResponse(tenantAdmin, tenantAdmin.id);
  },
  async (tenantAdminId, { container }) => {
    if (!tenantAdminId) {
      return;
    }

    const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

    await tenantModuleService.deleteTenantAdmins(tenantAdminId);
  },
);

export default createTenantAdminStep;
