import { Modules } from "@medusajs/framework/utils";
import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { deleteCampaignsWorkflow, removeRemoteLinkStep } from "@medusajs/medusa/core-flows";

export type DeleteTenantCampaignWorkflowInput = {
  campaign_id: string;
};

/**
 * Deletes a campaign and the tenant-campaign link. `deleteCampaignsWorkflow`
 * removes no links either, the same gap `delete-tenant-promotion` covers.
 */
const deleteTenantCampaignWorkflow = createWorkflow(
  "delete-tenant-campaign",
  (input: DeleteTenantCampaignWorkflowInput) => {
    deleteCampaignsWorkflow.runAsStep({
      input: transform({ input }, (data) => ({ ids: [data.input.campaign_id] })),
    });

    // The single-object form of this step's input carries an index signature the
    // workflow's own `WorkflowData` wrapper cannot satisfy; the array form is the
    // same call and typechecks.
    removeRemoteLinkStep(
      transform({ input }, (data) => [
        {
          [Modules.PROMOTION]: { campaign_id: data.input.campaign_id },
        },
      ]),
    );

    return new WorkflowResponse({ id: input.campaign_id });
  },
);

export default deleteTenantCampaignWorkflow;
