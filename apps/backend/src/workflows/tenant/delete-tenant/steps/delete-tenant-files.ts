import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { deleteTenantFiles } from "../../../../tenant-files";

export type DeleteTenantFilesStepInput = {
  tenant_id: string;
};

/**
 * Purges every file under the tenant's `tenants/<id>/` prefix (contract §4
 * step 4, `purge_files: true` only). No compensation: once the objects are
 * gone from disk or S3 there is nothing to restore them from, which is why
 * `deleteTenantWorkflow` runs this step last and only when explicitly asked.
 */
const deleteTenantFilesStep = createStep(
  "delete-tenant-files",
  async ({ tenant_id }: DeleteTenantFilesStepInput, { container }) => {
    const { deleted } = await deleteTenantFiles(container, tenant_id);

    return new StepResponse({ deleted });
  },
);

export default deleteTenantFilesStep;
