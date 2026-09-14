import type { CreatePromotionDTO } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { createPromotionsWorkflow, createRemoteLinkStep } from "@medusajs/medusa/core-flows";
import { TENANT_MODULE } from "../../../modules/tenant";

export type CreateTenantPromotionWorkflowInput = {
  tenant_id: string;
  /** The promotion to create, with its `sales_channel_id` rule already forced by the route. */
  promotion: CreatePromotionDTO;
  /**
   * The campaign ids the tenant already owns. A promotion body may create its
   * campaign inline (`campaign` instead of `campaign_id`), and that campaign is
   * nobody's until this workflow links it; an id already in this list is left
   * alone so the link is not written twice.
   */
  owned_campaign_ids: string[];
  /** Passed straight to `createPromotionsWorkflow`'s hooks, as the Admin route does. */
  additional_data?: Record<string, unknown>;
};

/**
 * Creates a promotion owned by the tenant: the Admin's own
 * `createPromotionsWorkflow`, then the tenant-promotion link that makes it
 * visible to `/tenants/promotions`, and the tenant-campaign link when the body
 * created its campaign inline.
 *
 * The link is a workflow step rather than a `link.create` in the route so that a
 * failure to link rolls the promotion back. Without that, a tenant would own a
 * promotion it can never see: the promotion would be live in its sales channel
 * and absent from every list in the panel.
 */
const createTenantPromotionWorkflow = createWorkflow(
  "create-tenant-promotion",
  (input: CreateTenantPromotionWorkflowInput) => {
    const created = createPromotionsWorkflow.runAsStep({
      input: transform({ input }, (data) => ({
        promotionsData: [data.input.promotion],
        additional_data: data.input.additional_data,
      })),
    });

    const linksToCreate = transform({ created, input }, (data) => {
      const promotion = data.created[0];
      const links: Record<string, Record<string, string>>[] = [
        {
          [TENANT_MODULE]: { tenant_id: data.input.tenant_id },
          [Modules.PROMOTION]: { promotion_id: promotion.id },
        },
      ];

      const campaignId = promotion.campaign_id as string | undefined | null;

      if (campaignId && !data.input.owned_campaign_ids.includes(campaignId)) {
        links.push({
          [TENANT_MODULE]: { tenant_id: data.input.tenant_id },
          [Modules.PROMOTION]: { campaign_id: campaignId },
        });
      }

      return links;
    });

    createRemoteLinkStep(linksToCreate);

    return new WorkflowResponse({
      promotion_id: transform({ created }, (data) => data.created[0].id),
    });
  },
);

export default createTenantPromotionWorkflow;
