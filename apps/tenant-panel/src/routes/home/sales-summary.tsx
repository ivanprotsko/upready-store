import { useEffect, useMemo, useState } from "react"
import { Button, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { useTenantAnalyticsSummary } from "../../hooks/api/analytics-summary"
import type { AnalyticsPeriodKey } from "../../hooks/api/analytics-summary"
import { SalesSummaryMetrics } from "./sales-summary-metrics"
import { SalesSummaryChart } from "./sales-summary-chart"
import { SalesSummaryTopProducts } from "./sales-summary-top-products"
import { SalesSummaryCustomRange, type CustomRange } from "./sales-summary-custom-range"
import {
  SalesSummaryCurrencyPicker,
  SalesSummaryOtherCurrencies,
} from "./sales-summary-currency"

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
  // The owner's currency pick, null until they make one. The backend then
  // shows its own choice (the period's biggest currency) and every number on
  // the screen belongs to that one currency alone (b12-analytics-accuracy).
  const [currency, setCurrency] = useState<string | null>(null)

  // The query only fires with a complete range: an incomplete "custom" pick
  // (one date, or neither yet) must not ask the backend, which would fall
  // back to its own 7-day default and show numbers the owner never chose.
  const query = useMemo(() => {
    const currencyPart = currency ? { currency } : {}

    if (period !== "custom") {
      return { period, ...currencyPart }
    }
    if (!customRange.from || !customRange.to) {
      return null
    }
    return {
      period: "custom" as const,
      from: toDateParam(customRange.from),
      to: toDateParam(customRange.to),
      ...currencyPart,
    }
  }, [period, customRange, currency])

  const { data, isPending, isError, error } = useTenantAnalyticsSummary(
    query ?? { period: "7d" },
    { enabled: query !== null }
  )

  // Which currencies the shop has, remembered across reloads. `data` goes
  // undefined while a new period or currency is being fetched, and the switch
  // must not blink out from under the finger that just used it. The list is
  // the server's fact, not the owner's pick, so refreshing it here overwrites
  // nothing they chose (rule 19h).
  const [knownCurrencies, setKnownCurrencies] = useState<string[]>([])

  useEffect(() => {
    if (data && data.has_orders) {
      setKnownCurrencies(data.currencies)
    }
  }, [data])

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
          <SalesSummaryCurrencyPicker
            currencies={knownCurrencies}
            selected={currency ?? (data && data.has_orders ? data.currency_code : null)}
            onSelect={setCurrency}
            disabled={query !== null && isPending}
          />
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
            canceled={data.canceled}
            currencyCode={data.currency_code ?? "usd"}
          />
          <SalesSummaryOtherCurrencies
            breakdown={data.currency_breakdown}
            selected={data.currency_code}
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
