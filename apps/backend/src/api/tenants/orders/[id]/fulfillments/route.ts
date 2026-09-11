import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntity } from "@medusajs/framework/http";
import type { HttpTypes } from "@medusajs/framework/types";
import { createOrderFulfillmentWorkflow } from "@medusajs/medusa/core-flows";
import { assertOwnedOrder } from "../../helpers";

/**
 * `POST /tenants/orders/:id/fulfillments` — fulfil items of one of the
 * tenant's own orders. Mirrors
 * `@medusajs/medusa/dist/api/admin/orders/[id]/fulfillments/route.js`: the
 * same `createOrderFulfillmentWorkflow`, the same `AdminOrderCreateFulfillment`
 * body, the order refetched in the Admin's retrieve shape so the panel's
 * mutation puts a fresh order into its cache.
 *
 * The ownership check runs BEFORE the workflow: the workflow has no notion of
 * a tenant and would fulfil any order id it is handed.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<HttpTypes.AdminCreateOrderFulfillment>,
  res: MedusaResponse,
) => {
  await assertOwnedOrder(req, req.params.id);

  await createOrderFulfillmentWorkflow(req.scope).run({
    input: {
      ...req.validatedBody,
      order_id: req.params.id,
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
