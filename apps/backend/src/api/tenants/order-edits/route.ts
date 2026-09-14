import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { emptyPage } from "../tenant-scope";

/**
 * `GET /tenants/order-edits` — an empty page, always.
 *
 * // tenant-panel: RMA and order editing are view-only in the panel. The
 * copied order-detail screen asks for returns, claims, exchanges and order
 * edits on mount to decide which timeline sections to render, and nothing in
 * the panel creates any of them: every RMA and edit action in the action menu
 * routes to `routes/not-built`. Answering the Admin's list shape with
 * `count: 0` keeps those sections empty instead of crashing the screen, and
 * keeps another tenant's RMA rows out of the response by construction rather
 * than by a filter that could be wrong.
 *
 * When the panel grows real RMA screens, this route becomes a scoped list the
 * way `/tenants/orders` is: own order ids through the tenant-order link, then
 * the Admin's own validator, query config and `refetchEntities`.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json({ order_edits: [], ...emptyPage(req) });
};
