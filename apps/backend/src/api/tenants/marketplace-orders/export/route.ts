import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { toCsv } from "../../../../modules/marketplace/order-feed";
import { loadFeed } from "../load-feed";

/**
 * `GET /tenants/marketplace-orders/export` — the CSV of EXACTLY the filtered
 * set (w15-mp-orders-desk).
 *
 * Same query string as the list route and the same `loadFeed`, which is the
 * whole point: the file and the table cannot drift, because there is one
 * function and the export takes no `limit`. The PR proves it by counting the
 * lines of the file against the count the screen shows.
 *
 * The file is answered INLINE as `text/csv` rather than uploaded to the file
 * module and answered as `{ url }` the way `POST /tenants/orders/export` does.
 * On the stands that module falls back to Medusa's local provider, which
 * returns a URL on port 9000 whatever port the backend listens on, so the
 * owner would get a link that does not open. A body the browser saves has no
 * such failure mode, and `wc -l` on it is a measurement anyone can repeat.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const feed = await loadFeed(req);
  const csv = toCsv(feed.rows);

  const stamp = new Date().toISOString().slice(0, 10);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="orders-${stamp}.csv"`);
  /** So the panel can show «строк: N» next to the download without parsing the body. */
  res.setHeader("X-Rows", String(feed.rows.length));
  res.send(csv);
};
