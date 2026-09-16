import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { DEFAULT_PERIOD_DAYS } from "../../../modules/marketplace/order-feed";
import { loadFeed } from "./load-feed";

/**
 * `GET /tenants/marketplace-orders` — one feed of shop, Wildberries and Ozon
 * orders (w15-mp-orders-desk, parity matrix rows 2/6/7/21).
 *
 * READ-ONLY. There is no POST, PUT, PATCH or DELETE in this directory, no
 * adapter is resolved and no endpoint id is named: the screen shows what the
 * imports put into `mp_order` and cannot change anything on a marketplace
 * (Ivan, 2026-09-16 02:46 WITA). `__tests__/order-feed-read-only.unit.spec.ts`
 * fails if that stops being true.
 *
 * Filters, all optional and all reflected in the URL so a view can be sent to
 * someone: `source` (`shop,wb,ozon`), `scheme` (`FBS,FBO,…`), `status` (the
 * common keys of `order-status.ts`), `from` / `to` (ISO dates), `limit` /
 * `offset`. With no period named the answer covers the last
 * 30 days and SAYS so in `period.is_default`, which is what the screen renders
 * above the table.
 *
 * What the answer carries besides the rows, and why each is there:
 *   `period`      so the empty state can name the period instead of showing a
 *                 blank table (rule 20a).
 *   `facets`      counted over the period BEFORE the other filters, so picking
 *                 one marketplace does not empty the marketplace filter.
 *   `connections` whether each marketplace has a key at all, and how its last
 *                 ORDER import ended. A failed import is why the table is
 *                 empty, and hiding it would let a broken sync read as «нет
 *                 заказов» (rule 20a).
 *   `undated`     orders the marketplace sent without a date, which therefore
 *                 fall in no period and are counted rather than lost.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const feed = await loadFeed(req);

  const limitRaw = Number(req.query.limit ?? 50);
  const offsetRaw = Number(req.query.offset ?? 0);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 200) : 50;
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;

  res.json({
    orders: feed.rows.slice(offset, offset + limit),
    count: feed.rows.length,
    offset,
    limit,
    period: {
      from: feed.filters.period.from.toISOString(),
      to: feed.filters.period.to.toISOString(),
      days: feed.filters.period.days,
      is_default: feed.filters.period.is_default,
      default_days: DEFAULT_PERIOD_DAYS,
    },
    applied: {
      source: feed.filters.sources,
      scheme: feed.filters.schemes,
      status: feed.filters.statuses,
    },
    facets: feed.facets,
    connections: feed.connections,
    undated: feed.undated,
  });
};
