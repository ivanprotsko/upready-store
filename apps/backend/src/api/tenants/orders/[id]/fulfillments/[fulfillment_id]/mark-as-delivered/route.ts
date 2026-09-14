import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntity } from "@medusajs/framework/http";
import type { HttpTypes } from "@medusajs/framework/types";
import { markOrderFulfillmentAsDeliveredWorkflow } from "@medusajs/medusa/core-flows";
import { assertOwnedOrder } from "../../../../helpers";

/**
 * `POST /tenants/orders/:id/fulfillments/:fulfillment_id/mark-as-delivered` —
 * mirrors
 * `@medusajs/medusa/dist/api/admin/orders/[id]/fulfillments/[fulfillment_id]/mark-as-delivered/route.js`,
 * `refetchEntity` included; that route is the one place the Admin already uses
 * it instead of the deprecated `remoteQuery`.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<HttpTypes.AdminMarkOrderFulfillmentAsDelivered>,
  res: MedusaResponse,
) => {
  const { id: orderId, fulfillment_id: fulfillmentId } = req.params;

  await assertOwnedOrder(req, orderId);

  await markOrderFulfillmentAsDeliveredWorkflow(req.scope).run({
    input: {
      orderId,
      fulfillmentId,
      no_notification: req.validatedBody?.no_notification,
    },
  });

  const order = await refetchEntity({
    entity: "order",
    idOrFilter: orderId,
    scope: req.scope,
    fields: req.queryConfig.fields,
  });

  res.status(200).json({ order });
};
