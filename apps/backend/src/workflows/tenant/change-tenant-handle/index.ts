import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import changeTenantHandleStep, {
  type ChangeTenantHandleStepInput,
} from "./steps/change-tenant-handle";

export type ChangeTenantHandleWorkflowInput = ChangeTenantHandleStepInput;

/**
 * `POST /tenants/handle` — the shop owner changes the address their storefront
 * answers on (`t-2026-09-12-tenant-address-canonical`).
 */
const changeTenantHandleWorkflow = createWorkflow(
  "change-tenant-handle",
  (input: ChangeTenantHandleWorkflowInput) => {
    const result = changeTenantHandleStep(input);

    return new WorkflowResponse(result);
  },
);

export default changeTenantHandleWorkflow;
