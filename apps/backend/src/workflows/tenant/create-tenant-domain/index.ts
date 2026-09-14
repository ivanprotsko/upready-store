import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import createTenantDomainStep, {
  type CreateTenantDomainStepInput,
} from "./steps/create-tenant-domain";

export type CreateTenantDomainWorkflowInput = CreateTenantDomainStepInput;

/**
 * `POST /tenants/domains` (tenant-panel wave 2, piece 9). A single-step
 * workflow rather than a bare service call from the route, the same shape
 * `update-tenant-admin` uses, so every `/tenants/*` mutation compensates the
 * same way.
 */
const createTenantDomainWorkflow = createWorkflow(
  "create-tenant-domain",
  (input: CreateTenantDomainWorkflowInput) => {
    const domain = createTenantDomainStep(input);

    return new WorkflowResponse(domain);
  },
);

export default createTenantDomainWorkflow;
