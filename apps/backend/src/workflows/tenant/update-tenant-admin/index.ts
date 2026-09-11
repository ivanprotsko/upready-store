import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import updateTenantAdminStep, {
  type UpdateTenantAdminStepInput,
} from "./steps/update-tenant-admin";

export type UpdateTenantAdminWorkflowInput = UpdateTenantAdminStepInput;

/**
 * `POST /tenants/me` (tenant-panel wave 2, piece 4). A single-step workflow
 * rather than a bare service call from the route, so the write has the same
 * compensation shape every other `/tenants/*` mutation uses.
 */
const updateTenantAdminWorkflow = createWorkflow(
  "update-tenant-admin",
  (input: UpdateTenantAdminWorkflowInput) => {
    const tenantAdmin = updateTenantAdminStep(input);

    return new WorkflowResponse(tenantAdmin);
  },
);

export default updateTenantAdminWorkflow;
