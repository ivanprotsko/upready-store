import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { useQueryGraphStep } from "@medusajs/medusa/core-flows";
import linkOrderToTenantStep from "./steps/link-order-to-tenant";

export type LinkOrderToTenantWorkflowInput = {
  order_id: string;
};

/**
 * Finds the order's sales channel and hands it to `linkOrderToTenantStep`.
 * Run by the `order.placed` subscriber for every storefront checkout. It is a
 * workflow rather than a bare subscriber body so that the seam tests and any
 * later backfill can call the same unit directly.
 *
 * Why a subscriber and not a workflow hook: in 2.19.0 `completeCartWorkflow`
 * creates the order through the Order Module service and emits
 * `order.placed`; it does not run `createOrdersWorkflow`, so that workflow's
 * `orderCreated` hook never fires for a storefront checkout (measured in
 * core-flows/dist/cart/workflows/complete-cart.js).
 */
const linkOrderToTenantWorkflow = createWorkflow(
  "link-order-to-tenant",
  (input: LinkOrderToTenantWorkflowInput) => {
    const { data: orders } = useQueryGraphStep({
      entity: "order",
      fields: ["id", "sales_channel_id"],
      filters: {
        id: input.order_id,
      },
      options: {
        throwIfKeyNotFound: true,
      },
    });

    const stepInput = transform({ orders }, (data) => ({
      order_id: data.orders[0].id,
      sales_channel_id: data.orders[0].sales_channel_id,
    }));

    const result = linkOrderToTenantStep(stepInput);

    return new WorkflowResponse(result);
  },
);

export default linkOrderToTenantWorkflow;
