import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import updateTenantStep from "./steps/update-tenant";

export type UpdateTenantWorkflowInput = {
  id: string;
  name?: string;
  metadata: Record<string, unknown> | null;
};

const updateTenantWorkflow = createWorkflow(
  "update-tenant",
  function (input: UpdateTenantWorkflowInput) {
    const tenant = updateTenantStep(input);

    return new WorkflowResponse(tenant);
  },
);

export default updateTenantWorkflow;
