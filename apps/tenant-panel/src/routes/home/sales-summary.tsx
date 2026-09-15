import { useState } from "react"
import { Button, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { useTenantAnalyticsSummary } from "../../hooks/api/analytics-summary"
import type { AnalyticsPeriodKey } from "../../hooks/api/analytics-summary"
import { SalesSummaryMetrics } from "./sales-summary-metrics"
import { SalesSummaryChart } from "./sales-summary-chart"
import { SalesSummaryTopProducts } from "./sales-summary-top-products"

const PERIODS: AnalyticsPeriodKey[] = ["today", "7d", "30d"]

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
  const { data, isPending, isError, error } = useTenantAnalyticsSummary({ period })

  if (isError) {
    throw error
  }

  return (
    <div className="flex flex-col gap-y-4 border-t pt-6">
      <div className="flex items-center justify-between">
        <Heading level="h2">{t("salesSummary.title")}</Heading>
        <div className="flex gap-x-1">
          {PERIODS.map((key) => (
            <Button
              key={key}
              size="small"
              variant={period === key ? "primary" : "secondary"}
              disabled={isPending}
              onClick={() => setPeriod(key)}
              data-testid={`sales-summary-period-${key}`}
            >
              {t(`salesSummary.period.${key}`)}
            </Button>
          ))}
        </div>
      </div>

      {isPending ? (
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
