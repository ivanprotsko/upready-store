import { FetchError } from "@medusajs/js-sdk"
import { QueryKey, UseQueryOptions, useQuery } from "@tanstack/react-query"

import { sdk } from "../../lib/client"
import { queryKeysFactory } from "../../lib/query-key-factory"

// tenant-panel: GET /tenants/analytics/summary (t17-analytics step 5), the
// panel home's sales summary. No Admin counterpart.

export type AnalyticsPeriodKey = "today" | "7d" | "30d" | "custom"

export type AnalyticsAggregate = { revenue: number; order_count: number; aov: number }

export type AnalyticsDailyPoint = { date: string; revenue: number; order_count: number }

export type AnalyticsSummaryEmpty = { has_orders: false }

/** One currency's own money for the chosen period. Never summed with another one. */
export type AnalyticsCurrencyBucket = {
  currency_code: string
  revenue: number
  order_count: number
  aov: number
}

export type AnalyticsSummary = {
  has_orders: true
  /**
   * The currency EVERY number below is in. The screen shows one currency at a
   * time, because a shop selling in two of them used to see the two totals
   * added together under the label of the first order's currency
   * (b12-analytics-accuracy).
   */
  currency_code: string | null
  /** Every currency the shop has ever taken money in, richest first. */
  currencies: string[]
  /**
   * The chosen period, one row per currency. The shown currency is always in
   * here, as a real computed zero when the period holds none of it.
   */
  currency_breakdown: AnalyticsCurrencyBucket[]
  period: { key: AnalyticsPeriodKey; from: string; to: string }
  current: AnalyticsAggregate
  previous: AnalyticsAggregate
  /**
   * Orders of the SAME period the shop cancelled. They are out of `current`
   * (a cancelled order is not revenue) and reported here so the screen can say
   * where they went instead of leaving an unexplained zero (b01-owner-numbers).
   */
  canceled: { order_count: number; revenue: number }
  /** The same for the previous period of the same length (t-2026-10-20-45). */
  previous_canceled: { order_count: number; revenue: number }
  change: {
    revenue_pct: number | null
    order_count_pct: number | null
    aov_pct: number | null
    /** Cancelled orders against the previous period; `null` when it had none. */
    canceled_pct: number | null
  }
  daily: AnalyticsDailyPoint[]
  /** The previous period day by day, as long as `daily` and in the same order. */
  previous_daily: AnalyticsDailyPoint[]
  top_products: { product_id: string; title: string; quantity: number; revenue: number }[]
}

export type AnalyticsSummaryResponse = AnalyticsSummary | AnalyticsSummaryEmpty

export type AnalyticsSummaryQuery = {
  period: AnalyticsPeriodKey
  from?: string
  to?: string
  /** The owner's currency pick. Omitted until they make one. */
  currency?: string
}

const ANALYTICS_SUMMARY_QUERY_KEY = "tenant-analytics-summary" as const
export const tenantAnalyticsSummaryQueryKeys = queryKeysFactory(ANALYTICS_SUMMARY_QUERY_KEY)

export const useTenantAnalyticsSummary = (
  query: AnalyticsSummaryQuery,
  options?: Omit<
    UseQueryOptions<AnalyticsSummaryResponse, FetchError, AnalyticsSummaryResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<AnalyticsSummaryResponse>("/tenants/analytics/summary", {
        query,
      }),
    queryKey: tenantAnalyticsSummaryQueryKeys.list(query),
    ...options,
  })

  return { data, ...rest }
}
