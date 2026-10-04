import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  PRICE_STOCK_EXPORT_LIMIT,
  filterPriceStockRows,
  parsePriceStockQuery,
  sortPriceStockRows,
  toPriceStockCsv,
} from "../../../../../../modules/marketplace/price-stock";
import { SOURCE_LABELS } from "../../../../../../modules/marketplace/order-feed";
import { getTenantScope } from "../../../../tenant-scope";
import { marketplaceOf } from "../../products/products-data";
import { loadPriceStockTable } from "../price-stock-data";

/**
 * `GET /tenants/marketplaces/:marketplace/price-stock/export` — the CSV of
 * EXACTLY the rows of the table (task-03), in its order and with its columns
 * first.
 *
 * Same query string as the list and the same `loadPriceStockTable`, filter and
 * order, which is the whole point: the file and the table cannot drift. The
 * export ignores `limit` / `offset` and stops at `PRICE_STOCK_EXPORT_LIMIT`
 * rows; `X-Total-Count` next to `X-Rows` says when it did.
 *
 * Answered INLINE as `text/csv` rather than through the file module, for the
 * reason `orders/export` records: on the stands that module falls back to the
 * local provider, whose URL carries port 9000 whatever port the backend
 * listens on, so the owner would get a link that does not open.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const adapter = marketplaceOf(req.params.marketplace);
  const query = parsePriceStockQuery(req.query as Record<string, unknown>);
  const table = await loadPriceStockTable(req.scope, tenant.id, adapter, query.thresholds);

  const matched = sortPriceStockRows(filterPriceStockRows(table.rows, query), query.order);
  const rows = matched.slice(0, PRICE_STOCK_EXPORT_LIMIT);

  const stamp = new Date().toISOString().slice(0, 10);
  const slug = adapter.id === "wb" ? "wildberries" : adapter.id;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${slug}-price-stock-${stamp}.csv"`);
  /** For a script or a test that counts without parsing: rows in the file, rows the filter matched. */
  res.setHeader("X-Rows", String(rows.length));
  res.setHeader("X-Total-Count", String(matched.length));
  res.send(toPriceStockCsv(rows, (SOURCE_LABELS as Record<string, string>)[adapter.id] ?? adapter.id));
};
