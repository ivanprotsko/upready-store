import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";

export type DeleteTenantAdminRowStepInput = { id: string };

/**
 * Deletes the `tenant_admin` row. Compensation re-inserts it with the SAME
 * id (Medusa's `model.id()` accepts an explicit id on create, the way every
 * other `create<Model>` call in this codebase that restores a deleted row
 * relies on), so a later step's failure (deleting the auth identity) does
 * not leave the row permanently gone while the identity still exists.
 */
const deleteTenantAdminRowStep = createStep(
  "delete-tenant-admin-row",
  async (input: DeleteTenantAdminRowStepInput, { container }) => {
    const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

    const admin = await tenantModuleService.retrieveTenantAdmin(input.id);

    await tenantModuleService.deleteTenantAdmins(input.id);

    return new StepResponse({ id: admin.id }, admin);
  },
  async (admin, { container }) => {
    if (!admin) {
      return;
    }

    const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

    await tenantModuleService.createTenantAdmins({
      id: admin.id,
      email: admin.email,
      first_name: admin.first_name,
      last_name: admin.last_name,
      tenant_id: admin.tenant_id as string,
    });
  },
);

export default deleteTenantAdminRowStep;
