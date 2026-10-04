import { Key } from "@medusajs/icons"
import { Alert, Badge, Button, Container, DatePicker, Heading, Text } from "@medusajs/ui"
import { keepPreviousData } from "@tanstack/react-query"
import { createColumnHelper } from "@tanstack/react-table"
import { useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Link, useSearchParams } from "react-router-dom"

import { NoRecords } from "../../../components/common/empty-table-content"
import { SupportDetails, marketplaceErrorKey } from "../../../components/common/support-details"
import { _DataTable } from "../../../components/table/data-table/data-table"
import { PlaceholderCell } from "../../../components/table/table-cells/common/placeholder-cell"
import type { FeedConnection } from "../../../hooks/api/marketplace-orders"
import { useDataTable } from "../../../hooks/use-data-table"
import { useDate } from "../../../hooks/use-date"
import {
  MARKETPLACE_LABEL,
  slugOf,
  useMpAnalytics,
  type MarketplaceId,
  type MpAnalyticsResponse,
} from "../../../hooks/api/marketplace-section"
import { getStylizedAmount } from "../../../lib/money-amount-helpers"
import { CardCell, MoneyCell, UnitsCell } from "../common/mp-cells"
import { MpPage } from "../common/mp-page"
import { useMpListQuery } from "../common/use-mp-list-query"
import { SalesChart } from "./components/sales-chart"

/**
 * «Wildberries → Аналитика» (mp-section-design): the seller's dashboard of
 * one marketplace. Read only, as w19 decided: it sums what the import stored
 * and never asks the marketplace when opened.
 *
 * The screen is three cards one under another: the period and the totals,
 * the sales by day, the cards with sales as the shop's own table. What is gone
 * against w19: the «← к подключению» link, the connection sentences printed on
 * every visit (the import's state has its own screen, «Обновление»), the raw
 * formulas under the numbers, the five extra tables of ABC/XYZ groups and
 * markets: ABC and XYZ are two columns of the cards table now, and a column
 * can be sorted.
 *
 * Live data (task-06): `GET /tenants/marketplaces/:marketplace/analytics`
 * folds what the import stored, on the shop's calendar; the period lives in
 * the address (`from=`, `to=`) and is written there only when the owner picks
 * a day. The connection banner speaks only when there is something to say,
 * like on «Заказы»; a shop with no key and nothing imported gets one empty
 * state with the way to the key instead of three cards of zeros.
 */

const PAGE_SIZE = 20

/** «Дней до нуля» at or under this is red: the stock runs out within two weeks. */
const DAYS_TO_ZERO_ALERT = 14

const BANNER: Record<string, "info" | "warning" | "error"> = {
  missing: "info",
  never_run: "warning",
  failed: "error",
  rate_limited: "warning",
  fixture: "warning",
}

type Card = MpAnalyticsResponse["cards"][number]

const asDate = (value: string | undefined): Date | undefined => {
  if (!value) {
    return undefined
  }
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) {
    return undefined
  }
  return new Date(year, month - 1, day)
}

/** `Date` → `YYYY-MM-DD` by the LOCAL calendar; `toISOString` would shift the day east of Greenwich (w15). */
const asIsoDay = (value: Date | null): string | null => {
  if (!value || Number.isNaN(value.getTime())) {
    return null
  }
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
}

export const MpAnalytics = ({ marketplace = "wb" }: { marketplace?: MarketplaceId }) => {
  const { t, i18n } = useTranslation()
  const { getFullDate } = useDate()
  const locale = i18n.language || "ru"
  const [searchParams, setSearchParams] = useSearchParams()
  const { params, raw } = useMpListQuery([], PAGE_SIZE)

  const from = searchParams.get("from") ?? undefined
  const to = searchParams.get("to") ?? undefined
  const { analytics, isLoading, isError, error } = useMpAnalytics(
    marketplace,
    { ...params, from, to },
    { placeholderData: keepPreviousData }
  )

  const setPeriod = useCallback(
    (nextFrom: string | null, nextTo: string | null) => {
      const next = new URLSearchParams(searchParams)
      nextFrom ? next.set("from", nextFrom) : next.delete("from")
      nextTo ? next.set("to", nextTo) : next.delete("to")
      next.delete("offset")
      setSearchParams(next)
    },
    [searchParams, setSearchParams]
  )

  const currency = analytics?.currency ?? "RUB"
  const columns = useColumns(currency)
  const { table } = useDataTable({
    data: analytics?.cards ?? [],
    columns,
    count: analytics?.cards_count ?? 0,
    enablePagination: true,
    pageSize: PAGE_SIZE,
    getRowId: (row) => row.id,
  })

  if (isError) {
    throw error
  }

  const label = MARKETPLACE_LABEL[marketplace]
  const slug = slugOf(marketplace)
  const formatDay = (day: string) => {
    const d = asDate(day)
    return d ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(d) : day
  }
  const money = (value: number | null) => (value === null ? "—" : getStylizedAmount(value, currency))
  const number = (value: number) => new Intl.NumberFormat(locale).format(value)

  const period = analytics?.period
  const totals = analytics?.totals
  const connection = analytics?.connection
  const rating = analytics?.rating

  /**
   * No key and nothing ever imported: the three cards would be zeros that
   * measure nothing. A shop that removed its key still has what it loaded,
   * and sees it under the banner instead.
   */
  const nothingStored =
    !!connection && !connection.connected && connection.rows_in_period === 0 && (totals?.cards_total ?? 0) === 0

  return (
    <MpPage
      stacked
      title={t("mp.analytics.title")}
      subtitle={
        period
          ? t(period.is_default ? "mp.analytics.periodDefault" : "mp.analytics.period", {
              marketplace: label,
              from: formatDay(period.from_day),
              to: formatDay(period.to_day),
              days: period.days,
            })
          : null
      }
      actions={
        <>
          <DatePicker
            aria-label={t("marketplaceAnalytics.filters.from")}
            value={asDate(from ?? period?.from_day)}
            maxValue={asDate(to ?? period?.to_day)}
            onChange={(value) => {
              // The picker re-emits the day it was given on mount; only a
              // day that differs from what is shown reaches the address.
              const next = asIsoDay(value)
              if (next !== (from ?? period?.from_day ?? null)) {
                setPeriod(next, to ?? null)
              }
            }}
          />
          <DatePicker
            aria-label={t("marketplaceAnalytics.filters.to")}
            value={asDate(to ?? period?.to_day)}
            minValue={asDate(from ?? period?.from_day)}
            maxValue={new Date()}
            onChange={(value) => {
              const next = asIsoDay(value)
              if (next !== (to ?? period?.to_day ?? null)) {
                setPeriod(from ?? null, next)
              }
            }}
          />
          {from || to ? (
            <Button size="small" variant="secondary" onClick={() => setPeriod(null, null)}>
              {t("marketplaceAnalytics.filters.reset")}
            </Button>
          ) : null}
        </>
      }
    >
      {connection?.notice && !nothingStored ? <ConnectionBanner connection={connection} slug={slug} /> : null}

      {nothingStored ? (
        <Container className="p-0">
          <NoRecords
            icon={<Key className="text-ui-fg-subtle" />}
            className="h-auto min-h-[150px] px-6 py-8 text-center"
            title={t("mp.analytics.noKey.title", { marketplace: label })}
            message={t("mp.analytics.noKey.message", { marketplace: label })}
            action={{ to: `/settings/integrations/${slug}`, label: t("mp.analytics.noKey.saveKey") }}
          />
        </Container>
      ) : null}

      {totals && !nothingStored ? (
        <Container className="divide-y p-0">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-6 py-4 md:grid-cols-3 xl:grid-cols-6">
            <Metric label={t("marketplaceAnalytics.metrics.revenue")} value={money(totals.revenue)} hint={t("marketplaceAnalytics.metrics.revenueHint")} />
            <Metric label={t("marketplaceAnalytics.metrics.orders")} value={number(totals.orders)} hint={t("mp.analytics.unitsHint", { units: number(totals.units) })} />
            <Metric label={t("marketplaceAnalytics.metrics.avgOrder")} value={money(totals.avg_order)} />
            <Metric
              label={t("marketplaceAnalytics.metrics.cancelled")}
              value={number(totals.cancelled_orders)}
              hint={t("marketplaceAnalytics.metrics.cancelledHint", { amount: money(totals.cancelled_revenue) })}
            />
            <Metric
              label={t("marketplaceAnalytics.metrics.cards")}
              value={`${number(totals.cards_with_sales)} / ${number(totals.cards_total)}`}
              hint={t("marketplaceAnalytics.metrics.cardsHint")}
            />
            <Metric
              label={t("mp.analytics.stock")}
              value={totals.stock_units === null ? "—" : `${number(totals.stock_units)} ${t("mp.units.pcs")}`}
              hint={
                totals.stock_units === null
                  ? t("mp.analytics.stockUnknown")
                  : totals.stock_days_left === null
                    ? t("mp.analytics.stockNoPace")
                    : totals.stock_looks_declared
                      ? t("mp.analytics.stockDaysDeclared", { days: number(totals.stock_days_left) })
                      : t("mp.analytics.stockDays", { days: number(totals.stock_days_left) })
              }
            />
          </div>
          {rating ? (
            <div className="flex flex-col gap-y-1 px-6 py-3" data-testid="mp-analytics-rating">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Text size="small" weight="plus">
                  {t("marketplaceAnalytics.rating.title")}
                </Text>
                <Badge size="2xsmall" color={rating.value === null ? "grey" : "green"}>
                  {rating.value === null ? "—" : `${rating.value} / ${rating.scale ?? 5}`}
                </Badge>
                <Text size="small" className="text-ui-fg-subtle">
                  {rating.as_of
                    ? t("mp.analytics.rating.withDate", {
                        detail: rating.detail,
                        date: getFullDate({ date: rating.as_of, includeTime: true }),
                      })
                    : rating.detail}
                </Text>
              </div>
              <SupportDetails text={rating.support} />
            </div>
          ) : null}
        </Container>
      ) : null}

      {analytics && !nothingStored ? (
        <Container className="divide-y p-0">
          <div className="px-6 py-4">
            <Heading level="h2">{t("marketplaceAnalytics.byDay.title")}</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              {t("mp.analytics.byDayHint")}
            </Text>
          </div>
          <div className="px-6 py-4">
            <SalesChart currency={analytics.currency} days={analytics.by_day} locale={locale} measure="revenue" />
          </div>
        </Container>
      ) : null}

      {nothingStored ? null : (
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">{t("mp.analytics.cards.title")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("mp.analytics.cards.hint")}
          </Text>
        </div>
        <_DataTable
          table={table}
          columns={columns}
          count={analytics?.cards_count ?? 0}
          pageSize={PAGE_SIZE}
          search
          pagination
          isLoading={isLoading}
          // Only a search makes an empty table «nothing found»; a sort or a
          // page over an empty period is still «продаж за период нет».
          queryObject={{ q: raw.q }}
          orderBy={[
            { key: "revenue", label: t("marketplaceAnalytics.metrics.revenue") },
            { key: "units", label: t("marketplaceAnalytics.metrics.units") },
            { key: "days_to_zero", label: t("mp.analytics.columns.daysToZero") },
          ]}
          noRecords={{
            title: t("mp.analytics.empty.title"),
            message: t("mp.analytics.empty.message"),
          }}
        />
      </Container>
      )}
    </MpPage>
  )
}

/** The banner over the metrics, the same rule as on «Заказы»: shown only when there is something to say. */
const ConnectionBanner = ({ connection, slug }: { connection: FeedConnection; slug: string }) => {
  const { t } = useTranslation()
  const notice = connection.notice
  if (!notice) {
    return null
  }
  return (
    <Alert variant={BANNER[notice] ?? "warning"} data-testid="mp-analytics-connection">
      <div className="flex flex-col gap-y-1">
        <Text size="small">
          {t(`mp.analytics.connection.${notice}`, {
            marketplace: connection.label,
            error: t(marketplaceErrorKey(connection.last_run?.error)),
          })}
        </Text>
        {notice === "fixture" ? null : (
          <Link
            to={notice === "missing" ? `/settings/integrations/${slug}` : `/marketplaces/${slug}/sync`}
            className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small w-fit"
          >
            {notice === "missing" ? t("mp.analytics.links.connect") : t("mp.analytics.links.sync")}
          </Link>
        )}
        {notice === "failed" && connection.last_run?.error ? <SupportDetails text={connection.last_run.error} /> : null}
      </div>
    </Alert>
  )
}

const Metric = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="flex min-w-0 flex-col gap-y-0.5">
    <Text size="xsmall" className="text-ui-fg-subtle">
      {label}
    </Text>
    <Text size="large" weight="plus" className="truncate tabular-nums">
      {value}
    </Text>
    {hint ? (
      <Text size="xsmall" className="text-ui-fg-muted">
        {hint}
      </Text>
    ) : null}
  </div>
)

const columnHelper = createColumnHelper<Card>()

const useColumns = (currency: string) => {
  const { t, i18n } = useTranslation()
  return useMemo(
    () => [
      columnHelper.display({
        id: "product",
        header: () => <span>{t("fields.product")}</span>,
        cell: ({ row }) => (
          <CardCell title={row.original.title} thumbnail={row.original.thumbnail} subtitle={row.original.vendor_code} />
        ),
        meta: { phoneTop: true },
      }),
      columnHelper.accessor("revenue", {
        header: () => <span>{t("marketplaceAnalytics.metrics.revenue")}</span>,
        cell: ({ getValue }) => <MoneyCell amount={getValue()} currency={currency} />,
        meta: { phoneTop: "end" },
      }),
      columnHelper.accessor("units", {
        header: () => <span>{t("marketplaceAnalytics.metrics.units")}</span>,
        cell: ({ getValue }) => <UnitsCell value={getValue()} unit={t("mp.units.pcs")} />,
      }),
      columnHelper.accessor("revenue_share", {
        header: () => <span>{t("mp.analytics.columns.share")}</span>,
        cell: ({ getValue }) => (
          <span className="tabular-nums">
            {new Intl.NumberFormat(i18n.language || "ru", { maximumFractionDigits: 1 }).format(getValue())} %
          </span>
        ),
      }),
      columnHelper.display({
        id: "abc",
        header: () => <span>ABC / XYZ</span>,
        cell: ({ row }) => (
          <div className="flex items-center gap-x-1">
            <Badge size="2xsmall">{row.original.abc}</Badge>
            {row.original.xyz ? <Badge size="2xsmall">{row.original.xyz}</Badge> : null}
          </div>
        ),
      }),
      columnHelper.accessor("stock", {
        header: () => <span>{t("mp.fields.stock")}</span>,
        cell: ({ getValue }) => <UnitsCell value={getValue()} unit={t("mp.units.pcs")} />,
      }),
      columnHelper.accessor("days_to_zero", {
        header: () => <span>{t("mp.analytics.columns.daysToZero")}</span>,
        cell: ({ getValue }) => {
          const days = getValue()
          if (days === null) {
            return <PlaceholderCell />
          }
          return (
            <span className={days <= DAYS_TO_ZERO_ALERT ? "text-ui-fg-error tabular-nums" : "tabular-nums"}>
              {t("mp.analytics.days", { count: days })}
            </span>
          )
        },
      }),
    ],
    [t, i18n.language, currency]
  )
}
