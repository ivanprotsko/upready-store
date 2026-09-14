import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntity } from "@medusajs/framework/http";
import type { HttpTypes } from "@medusajs/framework/types";
import { cancelOrderFulfillmentWorkflow } from "@medusajs/medusa/core-flows";
import { assertOwnedOrder } from "../../../../helpers";

/**
 * `POST /tenants/orders/:id/fulfillments/:fulfillment_id/cancel` — cancels one
 * fulfillment of one of the tenant's own orders. Mirrors
 * `@medusajs/medusa/dist/api/admin/orders/[id]/fulfillments/[fulfillment_id]/cancel/route.js`.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<HttpTypes.AdminCancelOrderFulfillment>,
  res: MedusaResponse,
) => {
  await assertOwnedOrder(req, req.params.id);

  await cancelOrderFulfillmentWorkflow(req.scope).run({
    input: {
      ...req.validatedBody,
      order_id: req.params.id,
      fulfillment_id: req.params.fulfillment_id,
      canceled_by: req.auth_context.actor_id,
    },
  });

  const order = await refetchEntity({
    entity: "order",
    idOrFilter: req.params.id,
    scope: req.scope,
    fields: req.queryConfig.fields,
  });

  res.status(200).json({ order });
};
