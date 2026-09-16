import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { DEFAULT_PERIOD_DAYS } from "../../../modules/marketplace/analytics";
import { loadAnalytics } from "./load-analytics";

/**
 * `GET /tenants/marketplace-analytics` — the seller dashboard of one shop
 * (w19-mp-analytics, parity matrix rows 14/15/16/17/19/20).
 *
 * READ-ONLY. There is no POST, PUT, PATCH or DELETE in this directory and no
 * adapter read of a marketplace's data: every number is folded out of
 * `mp_order` / `mp_order_line` / `mp_offer`, which an import filled
 * (Ivan, 2026-09-16 02:46 WITA). `modules/marketplace/__tests__/analytics-read-only.unit.spec.ts`
 * fails if that stops being true.
 *
 * Filters: `from` / `to` (ISO days, default the last 30 days and the answer
 * SAYS it chose them), `marketplace` (`wb,ozon`), `limit` / `offset` over the
 * card table only — the chart, the totals and the ABC/XYZ summaries always
 * cover the whole period, because a class computed over one page of cards
 * would be a different classification per page.
 *
 * What the answer carries besides the numbers, and why:
 *   `formulas`    the one line each block prints above itself, so a number can
 *                 be argued with rather than believed (rule 18e).
 *   `seller_currency` the currency every sum here is IN, taken from the shop's
 *                 own price list. The `currency` of an order is the BUYER's
 *                 country code and is broken out in `markets` instead.
 *   `connections` whether each marketplace has a key and how its last ORDER
 *                 import ended — the reason an empty screen is empty.
 *   `rating`      per marketplace: the seller rating, or WHY there is none,
 *                 with the marketplace's own refusal in it.
 *   `pnl`         the same shape for the finance half. It is honestly
 *                 incomplete and says so; no margin is estimated anywhere.
 *   `undated`     orders the marketplace sent with no date, which fall in no
 *                 period and are counted rather than lost (rule 20a).
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const startedAt = Date.now();
  const data = await loadAnalytics(req);

  const limitRaw = Number(req.query.limit ?? 50);
  const offsetRaw = Number(req.query.offset ?? 0);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 500) : 50;
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;

  res.json({
    period: {
      from: data.period.from.toISOString(),
      to: data.period.to.toISOString(),
      /** The calendar days the screen prints; an instant would shift by a timezone. */
      from_day: data.period.from_day,
      to_day: data.period.to_day,
      days: data.period.days,
      is_default: data.period.is_default,
      default_days: DEFAULT_PERIOD_DAYS,
    },
    applied: data.applied,
    seller_currency: data.seller_currency,
    markets: data.markets,
    totals: data.totals,
    by_day: data.by_day,
    cards: data.cards.slice(offset, offset + limit),
    cards_count: data.cards.length,
    offset,
    limit,
    abc: data.abc,
    xyz: data.xyz,
    xyz_bucket: data.xyz_bucket,
    xyz_buckets: data.xyz_buckets,
    stock_shape: data.stock_shape,
    stock_note: data.stock_note,
    xyz_dropped_days: data.xyz_dropped_days,
    formulas: data.formulas,
    facets: data.facets,
    connections: data.connections,
    rating: data.rating,
    pnl: data.pnl,
    undated: data.undated,
    /** How long the fold took on this shop's data, so slowness is visible. */
    computed_ms: Date.now() - startedAt,
  });
};
