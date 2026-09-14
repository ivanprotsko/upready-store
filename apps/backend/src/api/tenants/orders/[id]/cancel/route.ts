import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { refetchEntity } from "@medusajs/framework/http";
import { cancelOrderWorkflow } from "@medusajs/medusa/core-flows";
import { assertOwnedOrder } from "../../helpers";

/**
 * `POST /tenants/orders/:id/cancel` — cancels one of the tenant's own orders.
 * Mirrors `@medusajs/medusa/dist/api/admin/orders/[id]/cancel/route.js`, which
 * takes no body (its `validateAndTransformBody` line is commented out
 * upstream) and answers the order in the Admin's retrieve shape.
 */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  await assertOwnedOrder(req, req.params.id);

  await cancelOrderWorkflow(req.scope).run({
    input: {
      order_id: req.params.id,
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
