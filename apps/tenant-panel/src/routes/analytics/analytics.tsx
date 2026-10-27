import { Container, Text } from "@medusajs/ui"
import { keepPreviousData } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router-dom"

import { PeriodBar } from "../../components/analytics-period/period-bar"
import {
  activePresetOf,
  daysIn,
  presetFrom,
  resolveDays,
  summaryQueryOf,
  type Preset,
} from "../../components/analytics-period/period"
import { useTenantAnalyticsSummary } from "../../hooks/api/analytics-summary"
import { getStylizedAmount } from "../../lib/money-amount-helpers"
import { SalesSummaryCurrencyPicker, SalesSummaryOtherCurrencies } from "../home/sales-summary-currency"
import { SalesSummaryTopProducts } from "../home/sales-summary-top-products"
import { count, moneyWhole } from "../marketplaces/mp-analytics/components/format"
import { Panel, ShareDonut } from "../marketplaces/mp-analytics/components/infographic"
import { SalesChart } from "../marketplaces/mp-analytics/components/sales-chart"
import { Tile } from "../marketplaces/mp-analytics/components/tile"
import { MpPage } from "../marketplaces/common/mp-page"
import { chartDaysOf, previousDaysOf, productSharesOf, tilesOf } from "./view-model"

/**
 * «Аналитика магазина» (t-2026-10-20-45): the shop's own sales on a page of
 * their own, opened from the heading of the sales summary on «Обзор». It is
 * built from the parts of «Wildberries → Аналитика» (t-2026-10-16-36): the one
 * period control of the panel, four tiles with the change against the previous
 * period of the same length, the daily chart with the previous period dashed.
 * The numbers are those of the sales summary, from the same route
 * (`GET /tenants/analytics/summary`), so the two screens cannot disagree.
 *
 * Three states, not two (rule 19h): not answered yet, a shop that never had an
 * order («Заказов пока нет», never zeroes that look like a loss), and the
 * computed summary, whose own period may legitimately be all zeros.
 */
export const ShopAnalytics = () => {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || "ru"
  const [searchParams, setSearchParams] = useSearchParams()
  const from = searchParams.get("from") ?? undefined
  const to = searchParams.get("to") ?? undefined
  // The owner's currency pick, null until they make one; the route then shows
  // the period's biggest currency (b12-analytics-accuracy).
  const [currency, setCurrency] = useState<string | null>(null)
  const [knownCurrencies, setKnownCurrencies] = useState<string[]>([])

  const setPeriod = useCallback(
    (nextFrom: string | null, nextTo: string | null) => {
      const next = new URLSearchParams(searchParams)
      nextFrom ? next.set("from", nextFrom) : next.delete("from")
      nextTo ? next.set("to", nextTo) : next.delete("to")
      setSearchParams(next)
    },
    [searchParams, setSearchParams]
  )

  const days = useMemo(() => resolveDays(from, to), [from, to])
  const query = useMemo(() => ({ ...summaryQueryOf(from, to), ...(currency ? { currency } : {}) }), [from, to, currency])
  const { data, isPending, isError, error } = useTenantAnalyticsSummary(query, { placeholderData: keepPreviousData })

  // The list is the server's fact, kept while a new period is fetched so the
  // switch does not blink out from under the finger that used it.
  useEffect(() => {
    if (data && data.has_orders) {
      setKnownCurrencies(data.currencies)
    }
  }, [data])

  if (isError) {
    throw error
  }

  const activePreset = activePresetOf(from, to)
  const pickPreset = (preset: Preset) => (preset === 30 ? setPeriod(null, null) : setPeriod(presetFrom(preset), null))
  const length = daysIn(days)

  return (
    <MpPage
      stacked
      sticky
      title={t("shopAnalytics.title")}
      bar={
        <PeriodBar
          from={from}
          to={to}
          period={days}
          activePreset={activePreset}
          pickPreset={pickPreset}
          setPeriod={setPeriod}
          locale={locale}
        />
      }
    >
      {isPending ? (
        <Text size="small" className="text-ui-fg-subtle" data-testid="shop-analytics-loading">
          {t("salesSummary.loading")}
        </Text>
      ) : data && data.has_orders === false ? (
        <Container className="px-6 py-8" data-testid="shop-analytics-empty">
          <Text size="small" className="text-ui-fg-subtle">
            {t("salesSummary.noOrdersYet")}
          </Text>
        </Container>
      ) : data && data.has_orders ? (
        <ShopAnalyticsBody data={data} length={length} locale={locale} currencies={knownCurrencies} setCurrency={setCurrency} />
      ) : null}
    </MpPage>
  )
}

type Summary = Extract<NonNullable<ReturnType<typeof useTenantAnalyticsSummary>["data"]>, { has_orders: true }>

const ShopAnalyticsBody = ({
  data,
  length,
  locale,
  currencies,
  setCurrency,
}: {
  data: Summary
  length: number
  locale: string
  currencies: string[]
  setCurrency: (currency: string) => void
}) => {
  const { t } = useTranslation()
  const code = data.currency_code ?? "usd"
  const tiles = tilesOf(data)
  const money = (value: number) => getStylizedAmount(value, code)
  const previous = previousDaysOf(data)
  const shares = productSharesOf(data)
  const donutRows = shares
    ? [
        ...shares.named.map((row) => ({ ...row, previous: null })),
        ...(shares.rest ? [{ label: t("shopAnalytics.shares.rest"), ...shares.rest, previous: null }] : []),
      ]
    : []

  return (
    <>
      <SalesSummaryCurrencyPicker
        currencies={currencies}
        selected={data.currency_code}
        onSelect={setCurrency}
        disabled={false}
      />
      <SalesSummaryOtherCurrencies breakdown={data.currency_breakdown} selected={data.currency_code} />

      {/* Phone as on the marketplace page: the sum and the cancellations across, orders and the check side by side. */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-testid="shop-analytics-tiles">
        <Tile wide label={t("shopAnalytics.tiles.revenue")} value={money(tiles.revenue.value)} change={tiles.revenue.change} days={length} hint={t("shopAnalytics.tiles.revenueHint")} />
        <Tile label={t("shopAnalytics.tiles.orders")} value={count(tiles.orders.value, locale)} change={tiles.orders.change} days={length} />
        <Tile label={t("shopAnalytics.tiles.aov")} value={money(tiles.aov.value)} change={tiles.aov.change} neutral days={length} />
        <Tile
          wide
          label={t("shopAnalytics.tiles.canceled")}
          value={count(tiles.canceled.value, locale)}
          change={tiles.canceled.change}
          inverse
          days={length}
          rows={[[t("shopAnalytics.tiles.canceledSum"), money(tiles.canceled.amount)]]}
          hint={t("shopAnalytics.tiles.canceledHint")}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title={t("shopAnalytics.chart.title")}
          hint={
            <>
              {t("shopAnalytics.chart.hint")}
              {previous ? (
                <span className="text-ui-fg-muted" data-testid="shop-analytics-comparison">
                  {" · "}
                  {t("shopAnalytics.chart.dashed", { days: length })}
                </span>
              ) : null}
            </>
          }
          testId="shop-analytics-chart"
        >
          <Text size="small">
            {t("shopAnalytics.chart.average", {
              revenue: moneyWhole(data.current.revenue / length, code, locale),
              orders: count(Math.round(data.current.order_count / length), locale),
            })}
          </Text>
          <SalesChart
            hue
            currency={code}
            days={chartDaysOf(data.daily)}
            previous={previous}
            locale={locale}
            legend={t("shopAnalytics.chart.legend")}
          />
        </Panel>

        <Panel title={t("shopAnalytics.shares.title")} hint={t("shopAnalytics.shares.hint")} testId="shop-analytics-shares">
          {donutRows.length === 0 ? (
            <Text size="small" className="text-ui-fg-muted">
              {t("salesSummary.noSalesThisPeriod")}
            </Text>
          ) : (
            <ShareDonut hue rows={donutRows} currency={code} locale={locale} label={t("shopAnalytics.shares.title")} />
          )}
        </Panel>
      </div>

      <SalesSummaryTopProducts products={data.top_products} currencyCode={code} />
    </>
  )
}
