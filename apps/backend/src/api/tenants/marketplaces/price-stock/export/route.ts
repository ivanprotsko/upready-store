import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { toPriceStockCsv } from "../../../../../modules/marketplace/price-stock";
import { getTenantScope } from "../../../tenant-scope";
import {
  loadPriceStock,
  priceStockThresholdsFromQuery,
  tabFromQuery,
} from "../price-stock-data";

/**
 * `GET /tenants/marketplaces/price-stock/export` — the CSV of EXACTLY the
 * filtered set (deliverable 5).
 *
 * Same query string as the list route and the same `loadPriceStock`, which is
 * the whole point: the file and the table cannot drift, because there is one
 * loader and the export takes no `limit`. The PR counts the lines of the file
 * against the count the screen shows.
 *
 * Answered INLINE as `text/csv` rather than through the file module, for the
 * reason `marketplace-orders/export` records: on the stands that module falls
 * back to the local provider, whose URL carries port 9000 whatever port the
 * backend listens on, so the owner would get a link that does not open.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const query = req.query as Record<string, unknown>;

  const payload = await loadPriceStock(req.scope, tenant.id, {
    thresholds: priceStockThresholdsFromQuery(query),
    tab: tabFromQuery(query),
  });

  const csv = toPriceStockCsv(payload.rows, payload.marketplaces, payload.marketplace_labels);
  const stamp = payload.as_of.slice(0, 10);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="price-stock-${stamp}.csv"`);
  /** So the panel shows «строк: N» next to the download without parsing the body. */
  res.setHeader("X-Rows", String(payload.rows.length));
  res.send(csv);
};
