import { useMemo, useState } from "react"
import { Button, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { useTenantAnalyticsSummary } from "../../hooks/api/analytics-summary"
import type { AnalyticsPeriodKey } from "../../hooks/api/analytics-summary"
import { SalesSummaryMetrics } from "./sales-summary-metrics"
import { SalesSummaryChart } from "./sales-summary-chart"
import { SalesSummaryTopProducts } from "./sales-summary-top-products"
import { SalesSummaryCustomRange, type CustomRange } from "./sales-summary-custom-range"

const PERIODS: AnalyticsPeriodKey[] = ["today", "7d", "30d", "custom"]

/** `Date` → `YYYY-MM-DD`, the shape `/tenants/analytics/summary` reads for `from`/`to`. */
const toDateParam = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * t17-analytics step 5/6: revenue, order count, AOV, a daily chart and the
 * top five products for a period the owner picks. Three states, not two
 * (rule 19h): `isPending` (not answered yet — real, disabled period buttons,
 * no numbers guessed), `has_orders: false` (this shop has never had an
 * order — the honest "заказов пока нет"), and the computed summary, whose
 * own current period may legitimately be all zeros.
 */
export const SalesSummary = () => {
  const { t } = useTranslation()
  const [period, setPeriod] = useState<AnalyticsPeriodKey>("7d")
  const [customRange, setCustomRange] = useState<CustomRange>({ from: null, to: null })

  // The query only fires with a complete range: an incomplete "custom" pick
  // (one date, or neither yet) must not ask the backend, which would fall
  // back to its own 7-day default and show numbers the owner never chose.
  const query = useMemo(() => {
    if (period !== "custom") {
      return { period }
    }
    if (!customRange.from || !customRange.to) {
      return null
    }
    return {
      period: "custom" as const,
      from: toDateParam(customRange.from),
      to: toDateParam(customRange.to),
    }
  }, [period, customRange])

  const { data, isPending, isError, error } = useTenantAnalyticsSummary(
    query ?? { period: "7d" },
    { enabled: query !== null }
  )

  if (isError) {
    throw error
  }

  return (
    <div className="flex flex-col gap-y-4 border-t pt-6">
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <Heading level="h2">{t("salesSummary.title")}</Heading>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-x-1">
            {PERIODS.map((key) => (
              <Button
                key={key}
                size="small"
                variant={period === key ? "primary" : "secondary"}
                disabled={query !== null && isPending}
                onClick={() => setPeriod(key)}
                data-testid={`sales-summary-period-${key}`}
              >
                {t(`salesSummary.period.${key}`)}
              </Button>
            ))}
          </div>
          {period === "custom" ? (
            <SalesSummaryCustomRange range={customRange} onChange={setCustomRange} />
          ) : null}
        </div>
      </div>

      {query === null ? (
        <Text size="small" className="text-ui-fg-subtle" data-testid="sales-summary-pick-range">
          {t("salesSummary.pickRange")}
        </Text>
      ) : isPending ? (
        <Text size="small" className="text-ui-fg-subtle" data-testid="sales-summary-loading">
          {t("salesSummary.loading")}
        </Text>
      ) : data && data.has_orders === false ? (
        <Text size="small" className="text-ui-fg-subtle" data-testid="sales-summary-empty">
          {t("salesSummary.noOrdersYet")}
        </Text>
      ) : data && data.has_orders ? (
        <>
          <SalesSummaryMetrics
            current={data.current}
            change={data.change}
            currencyCode={data.currency_code ?? "usd"}
          />
          <SalesSummaryChart daily={data.daily} />
          <SalesSummaryTopProducts
            products={data.top_products}
            currencyCode={data.currency_code ?? "usd"}
          />
        </>
      ) : null}
    </div>
  )
}
