import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntity } from "@medusajs/framework/http";
import type { HttpTypes } from "@medusajs/framework/types";
import { createOrderShipmentWorkflow, updateFulfillmentWorkflow } from "@medusajs/medusa/core-flows";
import { assertOwnedOrder } from "../../../../helpers";

/**
 * `POST /tenants/orders/:id/fulfillments/:fulfillment_id/shipments` — marks a
 * fulfillment shipped. Mirrors
 * `@medusajs/medusa/dist/api/admin/orders/[id]/fulfillments/[fulfillment_id]/shipments/route.js`,
 * including the `labels ?? []` default and `created_by` from the token.
 *
 * `created_by` is the tenant admin's actor id, not a staff user id: the
 * fulfillment module stores it as a plain string and the column has no foreign
 * key, so an id from the `tenant` actor type is stored as it arrives.
 *
 * `metadata` (the panel sends `{carrier: "СДЭК"}`, the carrier the owner
 * typed next to the tracking number) is accepted by the Admin validator but
 * `createOrderShipmentWorkflow` writes only `labels` onto the fulfillment
 * (core-flows `create-shipment.js`, `fulfillmentData`), so it is written here
 * in a step of its own. The customer's account and the shipment e-mail read it
 * back from `fulfillment.metadata.carrier`.
 *
 * That step runs BEFORE the shipment, not after it. `createOrderShipmentWorkflow`
 * emits `shipment.created`, and `order-shipment-created-email` reads the carrier
 * off the fulfillment while handling that event: written afterwards, the carrier
 * lost the race every time and the letter carried a bare number (measured
 * 2026-09-15 on a clone of the client's database — «Трек-номер: 1005248796431»
 * in the inbox against `metadata.carrier = "СДЭК"` in the database).
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<HttpTypes.AdminCreateOrderShipment>,
  res: MedusaResponse,
) => {
  await assertOwnedOrder(req, req.params.id);

  const body = req.validatedBody;

  if (body.metadata && Object.keys(body.metadata).length > 0) {
    await updateFulfillmentWorkflow(req.scope).run({
      input: { id: req.params.fulfillment_id, metadata: body.metadata },
    });
  }

  await createOrderShipmentWorkflow(req.scope).run({
    input: {
      ...body,
      order_id: req.params.id,
      fulfillment_id: req.params.fulfillment_id,
      labels: body.labels ?? [],
      created_by: req.auth_context.actor_id,
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
