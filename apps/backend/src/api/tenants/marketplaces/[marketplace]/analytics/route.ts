import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { DEFAULT_PERIOD_DAYS } from "../../../../../modules/marketplace/analytics";
import { loadMpAnalytics } from "./load-analytics";

/**
 * `GET /tenants/marketplaces/:marketplace/analytics` — the seller's dashboard
 * of one marketplace («Wildberries → Аналитика», mp-section-design task-06;
 * the contract is `MpAnalyticsResponse` in the panel's
 * `hooks/api/marketplace-section.tsx`).
 *
 * READ-ONLY. There is no POST, PUT, PATCH or DELETE in this directory and no
 * adapter read of a marketplace's data: every number is folded out of
 * `mp_order` / `mp_order_line` / `mp_offer`, which an import filled, and
 * opening the screen sends nothing to the marketplace (Ivan, 2026-09-16 02:46
 * WITA). `modules/marketplace/__tests__/analytics-read-only.unit.spec.ts`
 * fails if that stops being true.
 *
 * The query, all optional and all in the panel's address:
 *   `from`, `to`    calendar days `YYYY-MM-DD` of the shop's calendar; the
 *                   last 30 days with today by default, and the answer SAYS
 *                   it chose them (`period.is_default`). A malformed day, a
 *                   period that ends before it starts or one longer than a
 *                   year is a 400.
 *   `q`             the card table only: the title or the vendor code.
 *   `order`         `revenue | units | days_to_zero`, `-` for descending,
 *                   `-revenue` by default.
 *   `limit`/`offset` the card table's page, 20 by default, 200 at most.
 *
 * The totals, the days and the ABC/XYZ classes always cover the whole period
 * and every card that sold: a class computed over one page, or over the cards
 * a search left, would be a different classification per page.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const data = await loadMpAnalytics(req);

  res.json({
    period: {
      from_day: data.period.from_day,
      to_day: data.period.to_day,
      days: data.period.days,
      is_default: data.period.is_default,
      default_days: DEFAULT_PERIOD_DAYS,
      time_zone: data.period.time_zone,
    },
    currency: data.currency,
    totals: data.totals,
    by_day: data.by_day,
    cards: data.cards,
    cards_count: data.cards_count,
    limit: data.query.limit,
    offset: data.query.offset,
    rating: data.rating,
    connection: data.connection,
  });
};
