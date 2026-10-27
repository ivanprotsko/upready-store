/**
 * What «Аналитика магазина» (t-2026-10-20-45) reads out of the answer of
 * `GET /tenants/analytics/summary`, as plain data. No React and no formatting
 * in here: the sales summary on «Обзор» and this page take their numbers from
 * the same fields, and this file is the one place a test can hold them to it.
 */

type Aggregate = { revenue: number; order_count: number; aov: number }

type Daily = { date: string; revenue: number; order_count: number }

export type SummaryShape = {
  current: Aggregate
  canceled: { order_count: number; revenue: number }
  change: {
    revenue_pct: number | null
    order_count_pct: number | null
    aov_pct: number | null
    canceled_pct: number | null
  }
  daily: Daily[]
  previous_daily: Daily[]
  top_products: { product_id: string; title: string; quantity: number; revenue: number }[]
}

/** The four tiles, in the order they are drawn. */
export const tilesOf = (summary: SummaryShape) => ({
  revenue: { value: summary.current.revenue, change: summary.change.revenue_pct },
  orders: { value: summary.current.order_count, change: summary.change.order_count_pct },
  aov: { value: summary.current.aov, change: summary.change.aov_pct },
  canceled: {
    value: summary.canceled.order_count,
    amount: summary.canceled.revenue,
    change: summary.change.canceled_pct,
  },
})

/** The days the chart draws, in the shape of its `SalesChartDay`. */
export const chartDaysOf = (days: Daily[]) =>
  days.map((day) => ({ day: day.date, revenue: day.revenue, orders: day.order_count }))

/**
 * The previous period for the dashed line, or `null` when it cannot be laid
 * over the chosen one day by day (an older answer without it, or a different
 * length).
 */
export const previousDaysOf = (summary: Pick<SummaryShape, "daily" | "previous_daily">) =>
  summary.previous_daily && summary.previous_daily.length === summary.daily.length
    ? chartDaysOf(summary.previous_daily)
    : null

/**
 * The best sellers as slices of a donut: the shop's revenue of the period is
 * the whole, the top products are named slices and everything else is one
 * slice «остальное». `null` when the period sold nothing.
 */
export const productSharesOf = (summary: Pick<SummaryShape, "current" | "top_products">) => {
  const total = summary.current.revenue
  if (total <= 0 || summary.top_products.length === 0) {
    return null
  }
  const named = summary.top_products.map((product) => ({
    label: product.title,
    revenue: product.revenue,
    share: Math.round((product.revenue / total) * 1000) / 10,
  }))
  const namedRevenue = named.reduce((sum, row) => sum + row.revenue, 0)
  const restRevenue = Math.round((total - namedRevenue) * 100) / 100
  return {
    named,
    rest: restRevenue > 0 ? { revenue: restRevenue, share: Math.round((restRevenue / total) * 1000) / 10 } : null,
  }
}
