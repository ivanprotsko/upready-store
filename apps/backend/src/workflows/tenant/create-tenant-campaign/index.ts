import type { CreateCampaignDTO } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { createCampaignsWorkflow, createRemoteLinkStep } from "@medusajs/medusa/core-flows";
import { TENANT_MODULE } from "../../../modules/tenant";

export type CreateTenantCampaignWorkflowInput = {
  tenant_id: string;
  campaign: CreateCampaignDTO;
  /** Passed straight to `createCampaignsWorkflow`'s hooks, as the Admin route does. */
  additional_data?: Record<string, unknown>;
};

/**
 * Creates a campaign owned by the tenant: the Admin's own
 * `createCampaignsWorkflow`, then the tenant-campaign link. The link is a step so
 * a failure to write it rolls the campaign back rather than leaving a campaign
 * nobody can list.
 */
const createTenantCampaignWorkflow = createWorkflow(
  "create-tenant-campaign",
  (input: CreateTenantCampaignWorkflowInput) => {
    const created = createCampaignsWorkflow.runAsStep({
      input: transform({ input }, (data) => ({
        campaignsData: [data.input.campaign],
        additional_data: data.input.additional_data,
      })),
    });

    const linksToCreate = transform({ created, input }, (data) => [
      {
        [TENANT_MODULE]: { tenant_id: data.input.tenant_id },
        [Modules.PROMOTION]: { campaign_id: data.created[0].id },
      },
    ]);

    createRemoteLinkStep(linksToCreate);

    return new WorkflowResponse({
      campaign_id: transform({ created }, (data) => data.created[0].id),
    });
  },
);

export default createTenantCampaignWorkflow;
