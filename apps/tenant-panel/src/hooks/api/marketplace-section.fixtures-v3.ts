import type { MarketplaceId, MpAnalyticsParams, MpAnalyticsResponse } from "./marketplace-section"
import { fixtureAnalyticsBase } from "./marketplace-section.fixtures"

/**
 * The dev fixture of «Аналитика» with the v3 fields (t-2026-10-16-36). It
 * has no previous period and no order facts, so those blocks stay out and
 * nothing is invented. A file of its own: the fixtures file is at its length
 * allowance.
 */
export const fixtureAnalytics = (marketplace: MarketplaceId, params: MpAnalyticsParams): MpAnalyticsResponse => {
  const base = fixtureAnalyticsBase(marketplace, params)
  const { revenue, orders } = base.totals
  const from = base.period.from_day
  return {
    ...base,
    cards: base.cards.map((card) => ({ ...card, category: null, revenue_previous: null, discount: null, warehouses: [] })),
    // The page's rows only: the base keeps its filtered list to itself.
    cards_revenue: base.cards.reduce((sum, card) => sum + card.revenue, 0),
    comparison: { from_day: from, to_day: from, available: false, data_from_day: from },
    totals_previous: null,
    by_day_previous: null,
    checks: { checks: orders, revenue, avg_check: orders > 0 ? Math.round(revenue / orders) : null },
    by_week: [],
    by_category: [],
    by_warehouse: [],
    by_region: { top: [], other: null, known_orders: 0, orders },
  }
}
