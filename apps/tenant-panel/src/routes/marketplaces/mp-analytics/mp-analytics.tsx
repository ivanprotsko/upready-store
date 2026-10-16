import { ArrowPath, Key } from "@medusajs/icons"
import { Alert, Badge, Button, Container, DatePicker, Heading, Text, clx } from "@medusajs/ui"
import { keepPreviousData } from "@tanstack/react-query"
import { createColumnHelper } from "@tanstack/react-table"
import { useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Link, useSearchParams } from "react-router-dom"

import { NoRecords } from "../../../components/common/empty-table-content"
import { SupportDetails, marketplaceErrorKey } from "../../../components/common/support-details"
import type { Filter } from "../../../components/table/data-table"
import { _DataTable } from "../../../components/table/data-table/data-table"
import { PlaceholderCell } from "../../../components/table/table-cells/common/placeholder-cell"
import type { FeedConnection } from "../../../hooks/api/marketplace-orders"
import { useDataTable } from "../../../hooks/use-data-table"
import {
  MARKETPLACE_LABEL,
  slugOf,
  useMpAnalytics,
  type MarketplaceId,
  type MpAnalyticsResponse,
} from "../../../hooks/api/marketplace-section"
import { CardCell } from "../common/mp-cells"
import { MpPage } from "../common/mp-page"
import { useMpListQuery } from "../common/use-mp-list-query"
import { changeOf, count, dayLong, moneyWhole, pct, range, signedPct } from "./components/format"
import { CategoryShares, ChecksByWeek, Panel, Regions, WarehouseSplit } from "./components/infographic"
import { SalesChart } from "./components/sales-chart"

/**
 * «Wildberries → Аналитика», v3 (t-2026-10-16-36), after the prototype Ivan
 * accepted on 15.10.2026: «список с товарами … можно оставить но добавить
 * фильтры … А над ним сделать инфорграфику с графиками … ну и разумеется
 * сделать выборку по датам и за период».
 *
 * Top to bottom: the period (ready periods, from/to, the comparison with the
 * previous period of the same length), four tiles with the change against
 * it, the infographic (daily dynamics with the previous period dashed, the
 * share of each category, the average check by week, WB or seller warehouse,
 * regions), then the compact list of products with its filters. The filters
 * narrow the list only; the tiles and the charts stay over the whole shop.
 *
 * Read only, as w19 decided: every number is folded from what the import
 * stored (`GET /tenants/marketplaces/:marketplace/analytics`), opening the
 * screen sends nothing to the marketplace. A block whose data the import does
 * not store (buyout, the funnel, profit, WB promotions) is left out rather
 * than drawn from a made-up number.
 *
 * The connection banner speaks only when there is something to say, like on
 * «Заказы»; a shop with no key and nothing imported gets one empty state with
 * the way to the key instead of blocks of zeros.
 */

const PAGE_SIZE = 10

/** «Дней до нуля» at or under this is red: the stock runs out within two weeks. */
const DAYS_TO_ZERO_ALERT = 14

/** The list filters the address carries, comma lists like every marketplace list. */
const FILTER_KEYS = ["category", "discount", "warehouse", "abc", "runs_out"]

/** The value the API reads as «no category» (`NO_CATEGORY` of the backend). */
const NO_CATEGORY = "__none__"

const PRESETS = [7, 30, 90] as const

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

/** The first day of a ready period ending today; the server stops `to` at the shop's today itself. */
const presetFrom = (preset: number | "month"): string | null => {
  const today = new Date()
  if (preset === "month") {
    return asIsoDay(new Date(today.getFullYear(), today.getMonth(), 1))
  }
  const from = new Date(today)
  from.setDate(from.getDate() - (preset - 1))
  return asIsoDay(from)
}

export const MpAnalytics = ({ marketplace = "wb" }: { marketplace?: MarketplaceId }) => {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || "ru"
  const [searchParams, setSearchParams] = useSearchParams()
  const { params, raw } = useMpListQuery(FILTER_KEYS, PAGE_SIZE)

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
  const columns = useColumns(currency, analytics?.comparison?.available ?? false, analytics?.period.days ?? 30)
  const filters = useFilters(analytics?.by_category ?? [])
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
  const money = (value: number | null) => (value === null ? "—" : moneyWhole(value, currency, locale))

  const period = analytics?.period
  const totals = analytics?.totals
  const connection = analytics?.connection
  const rating = analytics?.rating
  const comparison = analytics?.comparison
  const previous = analytics?.totals_previous ?? null
  /** An answer of the backend before v3 has none of the infographic fields: the page then shows what it has. */
  const infographic = analytics && analytics.by_category && analytics.by_week && analytics.by_region ? analytics : null

  /**
   * No key and nothing ever imported: the blocks would be zeros that measure
   * nothing. A shop that removed its key still has what it loaded, and sees
   * it under the banner instead.
   */
  const nothingStored =
    !!connection && !connection.connected && connection.rows_in_period === 0 && (totals?.cards_total ?? 0) === 0

  const activePreset = (() => {
    if (!from && !to) {
      return 30
    }
    if (to) {
      return null
    }
    if (from === presetFrom("month")) {
      return "month"
    }
    return PRESETS.find((preset) => presetFrom(preset) === from) ?? null
  })()

  const pickPreset = (preset: number | "month") =>
    preset === 30 ? setPeriod(null, null) : setPeriod(presetFrom(preset), null)

  return (
    <MpPage
      stacked
      title={t("mp.analytics.title")}
      subtitle={
        period
          ? t(period.is_default ? "mp.analytics.v3.subtitleDefault" : "mp.analytics.v3.subtitle", {
              marketplace: label,
              range: range(period.from_day, period.to_day, locale),
              count: period.days,
            })
          : null
      }
    >
      <Container className="flex flex-col gap-y-3 px-6 py-4" data-testid="mp-analytics-period">
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-ui-bg-subtle flex rounded-md p-0.5 max-md:w-full">
            {[...PRESETS, "month" as const].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => pickPreset(preset)}
                aria-pressed={activePreset === preset}
                className={clx(
                  "txt-compact-small-plus text-ui-fg-subtle rounded-[5px] px-3 py-1.5 max-md:min-h-11 max-md:flex-1",
                  activePreset === preset && "bg-ui-bg-base text-ui-fg-base shadow-borders-base"
                )}
              >
                {preset === "month" ? t("mp.analytics.v3.presets.month") : t("mp.analytics.v3.presets.days", { count: preset })}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 max-md:w-full [&>*]:max-md:flex-1">
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
          </div>
          {from || to ? (
            <Button size="small" variant="secondary" onClick={() => setPeriod(null, null)}>
              {t("marketplaceAnalytics.filters.reset")}
            </Button>
          ) : null}
        </div>
        {comparison ? (
          <div className="flex items-center gap-x-1.5" data-testid="mp-analytics-comparison">
            <ArrowPath className="text-ui-fg-muted shrink-0" />
            <Text size="small" className="text-ui-fg-subtle">
              {comparison.available
                ? t("mp.analytics.v3.comparison.with", { range: range(comparison.from_day, comparison.to_day, locale) })
                : comparison.data_from_day
                  ? t("mp.analytics.v3.comparison.noData", {
                      range: range(comparison.from_day, comparison.to_day, locale),
                      since: dayLong(comparison.data_from_day, locale),
                    })
                  : t("mp.analytics.v3.comparison.nothing")}
            </Text>
          </div>
        ) : null}
      </Container>

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

      {analytics && totals && !nothingStored ? (
        <>
          {/* Phone as in v3: the sum and the cancellations across, orders and the check side by side. */}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-testid="mp-analytics-tiles">
            <Tile
              wide
              label={t("mp.analytics.v3.tiles.revenue")}
              value={money(totals.revenue)}
              change={changeOf(totals.revenue, previous?.revenue)}
              days={analytics.period.days}
              hint={t("mp.analytics.v3.tiles.revenueHint")}
            />
            <Tile
              label={t("marketplaceAnalytics.metrics.orders")}
              value={count(totals.orders, locale)}
              change={changeOf(totals.orders, previous?.orders)}
              days={analytics.period.days}
              hint={t("mp.analytics.unitsHint", { units: count(totals.units, locale) })}
            />
            <Tile
              label={t("mp.analytics.v3.tiles.avgCheck")}
              value={money(analytics.checks?.avg_check ?? totals.avg_order)}
              change={changeOf(analytics.checks?.avg_check ?? null, previous?.avg_check)}
              neutral
              days={analytics.period.days}
              rows={[
                [t("mp.analytics.v3.tiles.checks"), analytics.checks ? count(analytics.checks.checks, locale) : "—"],
                [t("mp.analytics.v3.tiles.itemPrice"), money(totals.units > 0 ? totals.revenue / totals.units : null)],
              ]}
            />
            <Tile
              wide
              label={t("marketplaceAnalytics.metrics.cancelled")}
              value={count(totals.cancelled_orders, locale)}
              change={changeOf(totals.cancelled_orders, previous?.cancelled_orders)}
              inverse
              days={analytics.period.days}
              rows={[[t("mp.analytics.v3.tiles.cancelledSum"), money(totals.cancelled_revenue)]]}
              hint={t("mp.analytics.v3.tiles.cancelledHint")}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            <Panel
              className="xl:col-span-2"
              title={t("mp.analytics.v3.dynamics.title")}
              hint={
                <>
                  {t("mp.analytics.v3.dynamics.hint")}
                  {comparison?.available ? (
                    <span className="text-ui-fg-muted"> · {t("mp.analytics.v3.dynamics.dashed", { range: range(comparison.from_day, comparison.to_day, locale) })}</span>
                  ) : null}
                </>
              }
              testId="mp-analytics-dynamics"
            >
              <Text size="small">
                {t("mp.analytics.v3.dynamics.average", {
                  revenue: money(totals.revenue / analytics.period.days),
                  orders: count(Math.round(totals.orders / analytics.period.days), locale),
                })}
                {previous
                  ? ` ${t("mp.analytics.v3.dynamics.averageBefore", {
                      days: analytics.period.days,
                      revenue: money(previous.revenue / analytics.period.days),
                      orders: count(Math.round(previous.orders / analytics.period.days), locale),
                    })}`
                  : null}
              </Text>
              <SalesChart currency={analytics.currency} days={analytics.by_day} previous={analytics.by_day_previous ?? null} locale={locale} />
            </Panel>
            {infographic ? <CategoryShares analytics={infographic} locale={locale} /> : null}
          </div>

          {infographic ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              <ChecksByWeek analytics={infographic} locale={locale} />
              <WarehouseSplit analytics={infographic} locale={locale} />
              <Regions analytics={infographic} locale={locale} />
            </div>
          ) : null}
        </>
      ) : null}

      {nothingStored ? null : (
        <Container className="divide-y p-0" data-testid="mp-analytics-list">
          <div className="px-6 py-4">
            <Heading level="h2">{t("mp.analytics.v3.list.title")}</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              {totals
                ? t("mp.analytics.v3.list.hint", {
                    sold: count(totals.cards_with_sales, locale),
                    total: count(totals.cards_total, locale),
                    marketplace: label,
                  })
                : null}
            </Text>
          </div>
          <_DataTable
            table={table}
            columns={columns}
            count={analytics?.cards_count ?? 0}
            pageSize={PAGE_SIZE}
            filters={filters}
            search
            pagination
            isLoading={isLoading}
            // Only a search or a filter makes an empty table «nothing found»;
            // a sort or a page over an empty period is still «продаж за период нет».
            queryObject={{ q: raw.q }}
            orderBy={[
              { key: "revenue", label: t("mp.analytics.v3.columns.sum") },
              { key: "units", label: t("marketplaceAnalytics.metrics.units") },
              { key: "days_to_zero", label: t("mp.analytics.columns.daysToZero") },
            ]}
            noRecords={{
              title: t("mp.analytics.empty.title"),
              message: t("mp.analytics.empty.message"),
            }}
          />
          {analytics && totals ? (
            <div className="flex flex-col gap-y-1 px-6 py-4">
              <Text size="small" className="tabular-nums">
                {t("mp.analytics.v3.list.footer", {
                  matched: count(analytics.cards_count, locale),
                  sum: money(analytics.cards_revenue ?? null),
                  share: pct(totals.revenue > 0 ? Math.round((analytics.cards_revenue / totals.revenue) * 1000) / 10 : 0, locale),
                })}
              </Text>
              {rating ? (
                <div className="flex flex-col gap-y-1" data-testid="mp-analytics-rating">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Text size="small" weight="plus">
                      {t("marketplaceAnalytics.rating.title")}
                    </Text>
                    <Badge size="2xsmall" color={rating.value === null ? "grey" : "green"}>
                      {rating.value === null ? "—" : `${rating.value} / ${rating.scale ?? 5}`}
                    </Badge>
                    <Text size="small" className="text-ui-fg-subtle">
                      {rating.detail}
                    </Text>
                  </div>
                  <SupportDetails text={rating.support} />
                </div>
              ) : null}
            </div>
          ) : null}
        </Container>
      )}
    </MpPage>
  )
}

/** The banner over the blocks, the same rule as on «Заказы»: shown only when there is something to say. */
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

/**
 * One of the four numbers on top, with its change against the previous
 * period. Green is good: for «Отменено» a rise is red (`inverse`); the average
 * check moves both ways for good reasons and stays grey (`neutral`).
 */
const Tile = ({
  label,
  value,
  change,
  days,
  hint,
  rows,
  inverse,
  neutral,
  wide,
}: {
  /** Across the whole row on a phone and a tablet; one of four on a wide screen. */
  wide?: boolean
  label: string
  value: string
  change: number | null
  days: number
  hint?: string
  rows?: Array<[string, string]>
  inverse?: boolean
  neutral?: boolean
}) => {
  const { t, i18n } = useTranslation()
  const good = change === null || neutral ? null : inverse ? change < 0 : change > 0
  return (
    <Container className={clx("flex min-w-0 flex-col gap-y-1 px-5 py-4 max-md:px-4", wide && "col-span-2 xl:col-span-1")}>
      <Text size="small" className="text-ui-fg-subtle">
        {label}
      </Text>
      <Text size="xlarge" weight="plus" className="whitespace-nowrap tabular-nums">
        {value}
      </Text>
      {change !== null ? (
        <Text
          size="small"
          className={clx(
            "tabular-nums",
            good === null ? "text-ui-fg-subtle" : good ? "text-ui-tag-green-text" : "text-ui-fg-error"
          )}
        >
          {t("mp.analytics.v3.tiles.change", { value: signedPct(change, i18n.language || "ru"), days })}
        </Text>
      ) : null}
      {rows?.length ? (
        <div className="border-ui-border-base mt-1 flex flex-col gap-y-0.5 border-t pt-2">
          {rows.map(([name, amount]) => (
            <div key={name} className="flex items-center justify-between gap-x-2">
              <Text size="small" className="text-ui-fg-subtle">
                {name}
              </Text>
              <Text size="small" className="whitespace-nowrap tabular-nums">
                {amount}
              </Text>
            </div>
          ))}
        </div>
      ) : null}
      {hint ? (
        <Text size="xsmall" className="text-ui-fg-muted">
          {hint}
        </Text>
      ) : null}
    </Container>
  )
}

const useFilters = (categories: MpAnalyticsResponse["by_category"]): Filter[] => {
  const { t } = useTranslation()
  return useMemo<Filter[]>(
    () => [
      {
        key: "category",
        label: t("mp.analytics.v3.filters.category"),
        type: "select",
        multiple: true,
        searchable: true,
        options: categories.map((entry) => ({
          label: entry.category ?? t("mp.analytics.v3.categories.none"),
          value: entry.category ?? NO_CATEGORY,
        })),
      },
      {
        key: "discount",
        label: t("mp.analytics.v3.filters.discount"),
        type: "select",
        multiple: true,
        options: (["none", "lt20", "20to40", "gt40"] as const).map((bucket) => ({
          label: t(`mp.analytics.v3.discount.${bucket}`),
          value: bucket,
        })),
      },
      {
        key: "warehouse",
        label: t("mp.analytics.v3.filters.warehouse"),
        type: "select",
        multiple: true,
        options: [
          { label: t("mp.analytics.v3.warehouse.wb"), value: "wb" },
          { label: t("mp.analytics.v3.warehouse.seller"), value: "seller" },
        ],
      },
      {
        key: "abc",
        label: "ABC",
        type: "select",
        multiple: true,
        options: ["A", "B", "C"].map((value) => ({ label: value, value })),
      },
      {
        key: "runs_out",
        label: t("mp.analytics.v3.filters.runsOut"),
        type: "select",
        options: [{ label: t("mp.analytics.v3.filters.runsOutYes"), value: "1" }],
      },
    ],
    [t, categories]
  )
}

const columnHelper = createColumnHelper<Card>()

const useColumns = (currency: string, compared: boolean, days: number) => {
  const { t, i18n } = useTranslation()
  return useMemo(() => {
    const locale = i18n.language || "ru"
    return [
      columnHelper.display({
        id: "product",
        header: () => <span>{t("fields.product")}</span>,
        cell: ({ row }) => (
          <CardCell title={row.original.title} thumbnail={row.original.thumbnail} subtitle={row.original.vendor_code} />
        ),
        meta: { phoneTop: true },
      }),
      columnHelper.accessor("category", {
        header: () => <span>{t("mp.analytics.v3.filters.category")}</span>,
        cell: ({ getValue }) => {
          const category = getValue()
          return category ? <span className="text-ui-fg-subtle truncate">{category}</span> : <PlaceholderCell />
        },
        meta: { phoneHidden: true },
      }),
      columnHelper.accessor("revenue", {
        header: () => <span>{t("mp.analytics.v3.columns.sum")}</span>,
        cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{moneyWhole(getValue(), currency, locale)}</span>,
        meta: { phoneTop: "end" },
      }),
      ...(compared
        ? [
            columnHelper.display({
              id: "change",
              header: () => <span>{t("mp.analytics.v3.columns.change", { days })}</span>,
              cell: ({ row }) => {
                const change = changeOf(row.original.revenue, row.original.revenue_previous)
                if (change === null) {
                  return row.original.revenue_previous === 0 ? (
                    <span className="text-ui-fg-subtle">{t("mp.analytics.v3.columns.new")}</span>
                  ) : (
                    <PlaceholderCell />
                  )
                }
                return (
                  <span className={clx("tabular-nums", change >= 0 ? "text-ui-tag-green-text" : "text-ui-fg-error")}>
                    {signedPct(change, locale)}
                  </span>
                )
              },
            }),
          ]
        : []),
      columnHelper.accessor("orders", {
        header: () => <span>{t("marketplaceAnalytics.metrics.orders")}</span>,
        cell: ({ getValue }) => <span className="tabular-nums">{count(getValue(), locale)}</span>,
        meta: { phoneHidden: true },
      }),
      columnHelper.accessor("revenue_share", {
        header: () => <span>{t("mp.analytics.columns.share")}</span>,
        cell: ({ getValue }) => <span className="tabular-nums">{pct(getValue(), locale)}</span>,
        meta: { phoneHidden: true },
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
        meta: { phoneHidden: true },
      }),
      columnHelper.accessor("stock", {
        header: () => <span>{t("mp.fields.stock")}</span>,
        cell: ({ getValue }) => {
          const stock = getValue()
          return stock === null ? <PlaceholderCell /> : <span className="whitespace-nowrap tabular-nums">{`${count(stock, locale)} ${t("mp.units.pcs")}`}</span>
        },
        meta: { phoneHidden: true },
      }),
      columnHelper.accessor("days_to_zero", {
        header: () => <span>{t("mp.analytics.columns.daysToZero")}</span>,
        cell: ({ getValue }) => {
          const days = getValue()
          if (days === null) {
            return <PlaceholderCell />
          }
          return (
            <span className="whitespace-nowrap">
              <span className={days <= DAYS_TO_ZERO_ALERT ? "text-ui-fg-error tabular-nums" : "tabular-nums"}>
                {t("mp.analytics.days", { count: days })}
              </span>
            </span>
          )
        },
      }),
    ]
  }, [t, i18n.language, currency, compared, days])
}
