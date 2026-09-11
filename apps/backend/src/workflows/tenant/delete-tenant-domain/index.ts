import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import deleteTenantDomainStep, {
  type DeleteTenantDomainStepInput,
} from "./steps/delete-tenant-domain";

export type DeleteTenantDomainWorkflowInput = DeleteTenantDomainStepInput;

/** `DELETE /tenants/domains/:id` (tenant-panel wave 2, piece 9). */
const deleteTenantDomainWorkflow = createWorkflow(
  "delete-tenant-domain",
  (input: DeleteTenantDomainWorkflowInput) => {
    const deleted = deleteTenantDomainStep(input);

    return new WorkflowResponse(deleted);
  },
);

export default deleteTenantDomainWorkflow;
