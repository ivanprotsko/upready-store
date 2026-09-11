import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { getOrderDetailWorkflow } from "@medusajs/medusa/core-flows";
import { assertOwnedOrder } from "../helpers";

/**
 * `GET /tenants/orders/:id` — one of the tenant's own orders, in the Admin's
 * retrieve shape. Mirrors `@medusajs/medusa/dist/api/admin/orders/[id]/route.js`
 * GET: the same `getOrderDetailWorkflow`, the same `fields` and `version` from
 * the Admin's own `AdminGetOrdersOrderParams` + `retrieveTransformQueryConfig`,
 * so the copied order-detail screen reads the totals and items it expects.
 *
 * The Admin's `POST /admin/orders/:id` (update) is deliberately absent: the
 * panel's action menu routes email and address edits to `routes/not-built`.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  await assertOwnedOrder(req, req.params.id);

  const { result } = await getOrderDetailWorkflow(req.scope).run({
    input: {
      fields: req.queryConfig.fields,
      order_id: req.params.id,
      version: (req.validatedQuery as { version?: number } | undefined)?.version,
    },
  });

  res.status(200).json({ order: result });
};
