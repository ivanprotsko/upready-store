import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  filterPriceStockRows,
  parsePriceStockQuery,
  sortPriceStockRows,
} from "../../../../../modules/marketplace/price-stock";
import { getTenantScope } from "../../../tenant-scope";
import { marketplaceOf } from "../products/products-data";
import { loadPriceStockTable } from "./price-stock-data";

/**
 * `GET /tenants/marketplaces/:marketplace/price-stock` — «Wildberries → Цены и
 * остатки» (mp-section-design task-03): one row per card of the marketplace
 * and one per shop variant no card is linked to, the shop's price and stock
 * next to the marketplace's.
 *
 *   ?limit&offset&q&order&state&over_threshold&price_pct&stock_abs
 *
 * `state` is a list of `both|shop_only|marketplace_only`, `over_threshold=true`
 * keeps the highlighted rows, `price_pct` (10) and `stock_abs` (1) are the
 * thresholds of the highlight, whole numbers from 0. `q` looks in the title and
 * the article, `order` is `title|vendor_code|price_pct|stock_abs` (the gaps by
 * their size), `-` for descending. The contract is `MpPriceStockResponse` in
 * the panel's `hooks/api/marketplace-section.tsx`.
 *
 * `counts` is always of the WHOLE table and `rows` of the filter, so the
 * filter's labels do not change as the owner picks them.
 *
 * ONLY GET, here and in the two routes beside it. Ivan's standing invariant of
 * 2026-09-16 02:46 WITA is that this screen never edits a marketplace price or
 * stock — no inline edit, no bulk action, no «отправить на площадку» — and a
 * `POST` in this directory would be a route Medusa registers whatever its body
 * does. `price-stock-read-only.unit.spec.ts` fails on one.
 *
 * Scoped by `getTenantScope` like every `/tenants/*` route: the tenant comes
 * from the token and never from the query.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const adapter = marketplaceOf(req.params.marketplace);
  const query = parsePriceStockQuery(req.query as Record<string, unknown>);
  const table = await loadPriceStockTable(req.scope, tenant.id, adapter, query.thresholds);

  const rows = sortPriceStockRows(filterPriceStockRows(table.rows, query), query.order);

  res.json({
    rows: rows.slice(query.offset, query.offset + query.limit),
    count: rows.length,
    limit: query.limit,
    offset: query.offset,
    thresholds: table.thresholds,
    counts: table.counts,
    measured: table.measured,
    stored: table.stored,
  });
};
