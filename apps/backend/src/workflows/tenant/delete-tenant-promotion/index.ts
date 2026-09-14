import { Modules } from "@medusajs/framework/utils";
import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { deletePromotionsWorkflow, removeRemoteLinkStep } from "@medusajs/medusa/core-flows";

export type DeleteTenantPromotionWorkflowInput = {
  promotion_id: string;
};

/**
 * Deletes a promotion and the module links pointing at it.
 *
 * `deletePromotionsWorkflow` is one step and carries no `removeRemoteLinkStep`,
 * unlike `deleteProductsWorkflow`, so without this wrapper the tenant-promotion
 * row outlives the promotion and `tenant.promotions` keeps handing a dead id to
 * every list.
 */
const deleteTenantPromotionWorkflow = createWorkflow(
  "delete-tenant-promotion",
  (input: DeleteTenantPromotionWorkflowInput) => {
    deletePromotionsWorkflow.runAsStep({
      input: transform({ input }, (data) => ({ ids: [data.input.promotion_id] })),
    });

    // The single-object form of this step's input carries an index signature the
    // workflow's own `WorkflowData` wrapper cannot satisfy; the array form is the
    // same call and typechecks.
    removeRemoteLinkStep(
      transform({ input }, (data) => [
        {
          [Modules.PROMOTION]: { promotion_id: data.input.promotion_id },
        },
      ]),
    );

    return new WorkflowResponse({ id: input.promotion_id });
  },
);

export default deleteTenantPromotionWorkflow;
