import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  MP_ORDERS_EXPORT_LIMIT,
  toMpOrdersCsv,
} from "../../../../../../modules/marketplace/order-feed";
import { loadMpOrders, marketplaceOf } from "../load-orders";

/**
 * `GET /tenants/marketplaces/:marketplace/orders/export` — the CSV of EXACTLY
 * the filtered list (mp-section-design task-04).
 *
 * Same query string as the list route and the same `loadMpOrders`, which is
 * the whole point: the file and the table cannot drift, because there is one
 * function and the export ignores `limit` / `offset`. At most
 * `MP_ORDERS_EXPORT_LIMIT` rows, in the list's own order; the panel knows the
 * `count` and says so when the file is cut.
 *
 * The file is answered INLINE as `text/csv` rather than uploaded to the file
 * module and answered as `{ url }` the way `POST /tenants/orders/export` does.
 * On the stands that module falls back to Medusa's local provider, which
 * returns a URL on port 9000 whatever port the backend listens on, so the
 * owner would get a link that does not open. A body the browser saves has no
 * such failure mode, and counting its lines is a measurement anyone can repeat.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const adapter = marketplaceOf(req);
  const loaded = await loadMpOrders(req);
  const rows = loaded.rows.slice(0, MP_ORDERS_EXPORT_LIMIT);

  const stamp = new Date().toISOString().slice(0, 10);
  const slug = adapter.id === "wb" ? "wildberries" : adapter.id;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${slug}-orders-${stamp}.csv"`);
  /** For a script or a test that counts without parsing: rows in the file, rows the filter matched. */
  res.setHeader("X-Rows", String(rows.length));
  res.setHeader("X-Total-Count", String(loaded.rows.length));
  res.send(toMpOrdersCsv(rows));
};
