import { FetchError } from "@medusajs/js-sdk"
import { QueryKey, UseQueryOptions, useQuery } from "@tanstack/react-query"

import { sdk } from "../../lib/client"
import { queryKeysFactory } from "../../lib/query-key-factory"

// tenant-panel: GET /tenants/analytics/summary (t17-analytics step 5), the
// panel home's sales summary. No Admin counterpart.

export type AnalyticsPeriodKey = "today" | "7d" | "30d" | "custom"

export type AnalyticsAggregate = { revenue: number; order_count: number; aov: number }

export type AnalyticsSummaryEmpty = { has_orders: false }

export type AnalyticsSummary = {
  has_orders: true
  currency_code: string | null
  period: { key: AnalyticsPeriodKey; from: string; to: string }
  current: AnalyticsAggregate
  previous: AnalyticsAggregate
  /**
   * Orders of the SAME period the shop cancelled. They are out of `current`
   * (a cancelled order is not revenue) and reported here so the screen can say
   * where they went instead of leaving an unexplained zero (b01-owner-numbers).
   */
  canceled: { order_count: number; revenue: number }
  change: {
    revenue_pct: number | null
    order_count_pct: number | null
    aov_pct: number | null
  }
  daily: { date: string; revenue: number; order_count: number }[]
  top_products: { product_id: string; title: string; quantity: number; revenue: number }[]
}

export type AnalyticsSummaryResponse = AnalyticsSummary | AnalyticsSummaryEmpty

export type AnalyticsSummaryQuery = {
  period: AnalyticsPeriodKey
  from?: string
  to?: string
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
