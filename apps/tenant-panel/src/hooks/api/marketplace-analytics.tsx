import { FetchError } from "@medusajs/js-sdk"
import { QueryKey, UseQueryOptions, useQuery } from "@tanstack/react-query"

import { sdk } from "../../lib/client"
import { queryKeysFactory } from "../../lib/query-key-factory"

// tenant-panel: own hook, no Admin counterpart — GET /tenants/marketplace-analytics
// per w19-mp-analytics.
//
// READ-ONLY. There is no mutation hook in this file and there will not be one:
// the dashboard folds what the imports put into `mp_order`, `mp_order_line` and
// `mp_offer`, and changes nothing anywhere (Ivan, 2026-09-16 02:46 WITA). The
// backend suite `modules/marketplace/__tests__/analytics-read-only.unit.spec.ts`
// reads this file and fails on a `useMutation` appearing in it.

export type AnalyticsPeriod = {
  from: string
  to: string
  /** `YYYY-MM-DD` — what the screen prints. An instant would shift by a timezone. */
  from_day: string
  to_day: string
  days: number
  /** true when the screen chose the period, not the owner: it must say so. */
  is_default: boolean
  default_days: number
}

export type AnalyticsTotals = {
  revenue: number
  units: number
  orders: number
  cancelled_orders: number
  cancelled_revenue: number
  avg_order: number | null
  cards_with_sales: number
  /** Σ stock over every offer line; `null` — the marketplace said nothing about stock. */
  stock_units: number | null
  stock_days_left: number | null
}

export type AnalyticsDay = {
  day: string
  revenue: number
  units: number
  orders: number
  cancelled_units: number
  cancelled_revenue: number
  by_marketplace: Record<string, { revenue: number; units: number; orders: number }>
}

export type AnalyticsTurnover = {
  stock: number | null
  reserved: number | null
  offer_lines: number
  rate_per_day: number
  /** `null` — either the stock or the sales pace is unknown; NOT «ноль дней». */
  days_to_zero: number | null
  zero_on: string | null
  stock_measured_at: string | null
}

export type AnalyticsCard = {
  marketplace: string
  card_id: string | null
  vendor_code: string | null
  title: string | null
  revenue: number
  units: number
  orders: number
  avg_price: number | null
  revenue_share: number
  days_with_sales: number
  currency: string | null
  cancelled_units: number
  abc: "A" | "B" | "C"
  cumulative_share: number
  /** `null` — «недостаточно данных», which is not the same as Z. */
  xyz: "X" | "Y" | "Z" | null
  variation: number | null
  turnover: AnalyticsTurnover
}

export type AnalyticsGroup = {
  group: string | null
  cards: number
  units: number
  revenue: number
  revenue_share: number
}

export type AnalyticsSource = {
  marketplace: string
  label: string
  state: "ok" | "no_key" | "refused" | "never_asked" | "scope_missing"
  endpoint: string | null
  /** The marketplace's own answer, as our journal recorded it. */
  refusal: { status: number | null; text: string | null; at: string | null } | null
  detail: string
  see: string | null
}

export type AnalyticsConnection = {
  marketplace: string
  label: string
  connected: boolean
  last_run: {
    kind: string
    status: string
    started_at: string | null
    finished_at: string | null
    rows: number | null
    error: string | null
    is_fixture: boolean
  } | null
  orders_in_period: number
}

export type AnalyticsMarket = {
  /** The BUYER's country currency code as the marketplace sent it; `null` when none. */
  currency: string | null
  /** What the screen shows instead of a raw code. */
  label: string
  /** In the SELLER's currency, like every sum on this screen. */
  revenue: number
  units: number
  orders: number
}

export type MarketplaceAnalyticsResponse = {
  period: AnalyticsPeriod
  applied: { marketplace: string[] }
  /**
   * The currency every sum here is IN, taken from the shop's own price list.
   * The `currency` of an ORDER is the buyer's country code and is broken out
   * in `markets`: WB stores `convertedPrice` / `finished_price`, both already
   * in the seller's currency, so splitting the money by that code would label
   * roubles as Belarusian roubles.
   */
  seller_currency: string | null
  markets: AnalyticsMarket[]
  totals: AnalyticsTotals
  by_day: AnalyticsDay[]
  cards: AnalyticsCard[]
  cards_count: number
  offset: number
  limit: number
  abc: AnalyticsGroup[]
  xyz: AnalyticsGroup[]
  /** `week` | `day` — which interval the coefficient of variation was taken over. */
  xyz_bucket: string
  xyz_buckets: number
  /** Days at the start of the period left out of XYZ: the interval would be partial. */
  xyz_dropped_days: number
  /** The one line each block prints above itself, so its number can be argued with. */
  formulas: { revenue: string; stock: string; abc: string; xyz: string }
  facets: { marketplace: string; label: string; orders: number; revenue: number }[]
  connections: AnalyticsConnection[]
  rating: AnalyticsSource[]
  pnl: AnalyticsSource[]
  undated: number
  computed_ms: number
}

const MARKETPLACE_ANALYTICS_QUERY_KEY = "tenant-marketplace-analytics" as const
export const marketplaceAnalyticsQueryKeys = queryKeysFactory(MARKETPLACE_ANALYTICS_QUERY_KEY)

export const useMarketplaceAnalytics = (
  search: string,
  options?: Omit<
    UseQueryOptions<
      MarketplaceAnalyticsResponse,
      FetchError,
      MarketplaceAnalyticsResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const query = search.replace(/^\?/, "")

  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<MarketplaceAnalyticsResponse>(
        `/tenants/marketplace-analytics${query ? `?${query}` : ""}`
      ),
    queryKey: marketplaceAnalyticsQueryKeys.list(query),
    ...options,
  })

  // Named field rather than `...data`: react-query's own result carries
  // `status`, and a response field of the same name would be overwritten by it
  // (the reason the marketplaces hook records).
  return { analytics: data, ...rest }
}
