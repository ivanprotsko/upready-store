import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import upsertTenantHomeStep, {
  type UpsertTenantHomeStepInput,
} from "./steps/upsert-tenant-home";

export type UpsertTenantHomeWorkflowInput = UpsertTenantHomeStepInput;

/**
 * `PUT /tenants/home` (tenant-panel wave 2, piece 8). One step, the same shape
 * `update-tenant-admin` uses: the route validates the document and checks that
 * `content.products.category_id` is the tenant's own, then hands the finished
 * document here so the write carries a compensation like every other
 * `/tenants/*` mutation.
 */
const upsertTenantHomeWorkflow = createWorkflow(
  "upsert-tenant-home",
  (input: UpsertTenantHomeWorkflowInput) => {
    const homeConfig = upsertTenantHomeStep(input);

    return new WorkflowResponse(homeConfig);
  },
);

export default upsertTenantHomeWorkflow;
