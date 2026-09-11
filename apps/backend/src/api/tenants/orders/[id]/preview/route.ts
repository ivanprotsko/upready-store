import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { assertOwnedOrder } from "../../helpers";

/**
 * `GET /tenants/orders/:id/preview` — the order with its pending order-change
 * applied, which is what the order-detail screen polls while an edit, a claim
 * or an exchange is open. Mirrors
 * `@medusajs/medusa/dist/api/admin/orders/[id]/preview/route.js`: the order
 * module's own `previewOrderChange`, no workflow.
 *
 * The panel creates no order changes today (RMA and edits route to
 * `routes/not-built`), so this answers the plain order. It exists because the
 * copied screen calls it on mount.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { id } = req.params;

  await assertOwnedOrder(req, id);

  const orderModuleService = req.scope.resolve(Modules.ORDER);
  const order = await orderModuleService.previewOrderChange(id);

  res.status(200).json({ order });
};
