import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { resolvePage } from "../../../../../modules/marketplace/order-feed";
import { loadMpOrders, withLineCounts } from "./load-orders";

/**
 * `GET /tenants/marketplaces/:marketplace/orders` — the orders of one
 * marketplace as the import stored them («Wildberries → Заказы»,
 * mp-section-design task-04; the contract is `MpOrdersResponse` in the panel's
 * `hooks/api/marketplace-section.tsx`).
 *
 * READ-ONLY. There is no POST, PUT, PATCH or DELETE in this directory, no
 * adapter network member is called and no endpoint id is named: the screen
 * shows what the imports put into `mp_order` and cannot change anything on a
 * marketplace (Ivan, 2026-09-16 02:46 WITA).
 * `modules/marketplace/__tests__/order-feed-read-only.unit.spec.ts` fails if
 * that stops being true.
 *
 * The query, all optional and all in the panel's address so a view can be
 * sent to someone: `limit` / `offset` (20 by default, 200 at most), `q`
 * (number or buyer's region), `status` (the common keys of `order-status.ts`),
 * `scheme` (`FBS,FBO,…`, `none` for «без схемы»), `ordered_at`
 * (`{"$gte":"…","$lte":"…"}`), `order` (`ordered_at | total | number`, `-` for
 * descending, `-ordered_at` by default). No period is applied unless
 * `ordered_at` names one.
 *
 * What the answer carries besides the rows, and why each is there:
 *   `facets`      counted over every order of the marketplace BEFORE the
 *                 filters, so picking one status does not empty the filter.
 *   `connection`  whether the shop has a key at all, and how its last ORDER
 *                 import ended. A failed import is why the list is empty, and
 *                 hiding it would let a broken sync read as «нет заказов»
 *                 (rule 20a).
 *   `undated`     orders the marketplace sent without a date: in the list,
 *                 last when sorted by date, and outside every date filter.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { limit, offset } = resolvePage(req.query as Record<string, unknown>);
  const loaded = await loadMpOrders(req);

  res.json({
    orders: await withLineCounts(req, loaded.rows.slice(offset, offset + limit)),
    count: loaded.rows.length,
    limit,
    offset,
    facets: loaded.facets,
    connection: loaded.connection,
    undated: loaded.undated,
  });
};
