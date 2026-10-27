import { Container, Heading, Text, clx } from "@medusajs/ui"
import { useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import type { MpAnalyticsResponse } from "../../../../hooks/api/marketplace-section"
import { changeOf, count, dayShort, moneyCompact, moneyWhole, pct, signedPct } from "./format"

/**
 * The infographic of «Аналитика» v3 (t-2026-10-16-36): the share of each
 * category, the average check by week, where the orders shipped from and
 * where the buyers are. Every block draws one field of the analytics answer
 * and nothing else; a block whose field is empty says so instead of drawing
 * a zero that was never measured (rule 20a).
 *
 * The shades are one colour at falling opacity, the way the prototype draws
 * them, so the blocks follow the panel's light and dark theme on their own.
 */

type Analytics = MpAnalyticsResponse

/** Seven categories by name; the rest is one line, or the donut turns into dust. */
const TOP_CATEGORIES = 7
const SHADES = [1, 0.72, 0.52, 0.38, 0.27, 0.19, 0.13, 0.08]

export const Panel = ({
  title,
  hint,
  children,
  footer,
  className,
  testId,
}: {
  title: string
  hint?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
  testId?: string
}) => (
  <Container className={clx("flex min-w-0 flex-col gap-y-4 px-6 py-4", className)} data-testid={testId}>
    <div className="flex flex-col gap-y-1">
      <Heading level="h2">{title}</Heading>
      {hint ? (
        <Text size="small" className="text-ui-fg-subtle">
          {hint}
        </Text>
      ) : null}
    </div>
    <div className="flex min-w-0 flex-1 flex-col gap-y-3">{children}</div>
    {footer ? (
      <Text size="xsmall" className="text-ui-fg-muted">
        {footer}
      </Text>
    ) : null}
  </Container>
)

const Empty = ({ children }: { children: ReactNode }) => (
  <Text size="small" className="text-ui-fg-muted">
    {children}
  </Text>
)

const Change = ({ value, locale }: { value: number | null; locale: string }) =>
  value === null ? null : (
    <span className={clx("tabular-nums", value > 0 ? "text-ui-tag-green-text" : value < 0 ? "text-ui-fg-error" : "text-ui-fg-muted")}>
      {signedPct(value, locale)}
    </span>
  )

/* ------------------------------------------------------------- категории */

/** One slice of a share donut. `previous` is the same slice a period ago, `null` when unknown. */
export type ShareRow = { label: string; revenue: number; share: number; previous: number | null }

/** Hues for the slices of a donut that asks for them, in the order of the slices. */
const HUES = [
  { stroke: "stroke-ui-tag-blue-icon", bg: "bg-ui-tag-blue-icon" },
  { stroke: "stroke-ui-tag-green-icon", bg: "bg-ui-tag-green-icon" },
  { stroke: "stroke-ui-tag-orange-icon", bg: "bg-ui-tag-orange-icon" },
  { stroke: "stroke-ui-tag-purple-icon", bg: "bg-ui-tag-purple-icon" },
  { stroke: "stroke-ui-tag-red-icon", bg: "bg-ui-tag-red-icon" },
  { stroke: "stroke-ui-tag-neutral-icon", bg: "bg-ui-tag-neutral-icon" },
]

/**
 * The donut with its legend. With `hue` every slice has its own colour and
 * hover, a touch or a click on a slice (or on its legend row) puts that
 * slice's name, sum and share in the centre (Ivan, 21.10: «при клике на
 * сегменты графика тоже показывались значения»); the others fade. Without it
 * the slices are the shades of one grey, the way «Категории» always drew them.
 */
export const ShareDonut = ({
  rows,
  currency,
  locale,
  label,
  hue,
}: {
  rows: ShareRow[]
  currency: string | null
  locale: string
  label: string
  hue?: boolean
}) => {
  const [hover, setHover] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const active = hover ?? pinned
  const total = rows.reduce((sum, entry) => sum + entry.revenue, 0)
  const radius = 52
  const circumference = 2 * Math.PI * radius
  let offset = 0
  const chosen = active === null ? null : rows[active]
  const toggle = (index: number) => setPinned((now) => (now === index ? null : index))

  return (
    <>
      <div className="relative mx-auto size-40">
        <svg viewBox="0 0 140 140" className="size-40 -rotate-90" role="img" aria-label={label}>
          {rows.map((row, index) => {
            const length = (row.revenue / total) * circumference
            const dash = `${Math.max(0, length - 1.5)} ${circumference}`
            const node = (
              <circle
                key={row.label}
                cx={70}
                cy={70}
                r={radius}
                fill="none"
                strokeWidth={active === index ? 24 : 20}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                className={hue ? HUES[index % HUES.length].stroke : "stroke-ui-fg-base"}
                opacity={hue ? (active === null || active === index ? 1 : 0.35) : (SHADES[index] ?? 0.08)}
                style={hue ? { cursor: "pointer" } : undefined}
                data-testid={hue ? `share-donut-slice-${index}` : undefined}
                onPointerEnter={hue ? (event) => event.pointerType === "mouse" && setHover(index) : undefined}
                onPointerLeave={hue ? () => setHover(null) : undefined}
                onClick={hue ? () => toggle(index) : undefined}
              />
            )
            offset += length
            return node
          })}
        </svg>
        {/* The sum alone, or the chosen slice: the period is in the bar on top (t-2026-10-20-29). */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
          {chosen ? (
            <>
              <Text size="xsmall" className="text-ui-fg-subtle line-clamp-2 leading-tight">
                {chosen.label}
              </Text>
              <Text size="base" weight="plus" className="tabular-nums">
                {moneyCompact(chosen.revenue, currency, locale)}
              </Text>
              <Text size="xsmall" className="text-ui-fg-subtle tabular-nums">
                {pct(chosen.share, locale)}
              </Text>
            </>
          ) : (
            <Text size="base" weight="plus" className="tabular-nums">
              {moneyCompact(total, currency, locale)}
            </Text>
          )}
        </div>
      </div>
      <ul className="flex flex-col gap-y-2">
        {rows.map((row, index) => (
          <li
            key={row.label}
            className={clx("grid grid-cols-[12px_1fr_auto_auto] items-center gap-x-2", hue && "cursor-pointer", hue && active !== null && active !== index && "opacity-60")}
            onPointerEnter={hue ? (event) => event.pointerType === "mouse" && setHover(index) : undefined}
            onPointerLeave={hue ? () => setHover(null) : undefined}
            onClick={hue ? () => toggle(index) : undefined}
          >
            <span
              className={clx("size-2.5 rounded-sm", hue ? HUES[index % HUES.length].bg : "bg-ui-fg-base")}
              style={hue ? undefined : { opacity: SHADES[index] ?? 0.08 }}
            />
            <Text size="small" className="truncate">
              {row.label}
            </Text>
            <Text size="small" className="tabular-nums">
              {pct(row.share, locale)}
            </Text>
            <Text size="xsmall" className="w-14 text-right">
              <Change value={changeOf(row.revenue, row.previous)} locale={locale} />
            </Text>
          </li>
        ))}
      </ul>
    </>
  )
}

export const CategoryShares = ({ analytics, locale }: { analytics: Analytics; locale: string }) => {
  const { t } = useTranslation()
  const shares = analytics.by_category
  const total = shares.reduce((sum, entry) => sum + entry.revenue, 0)
  const head = shares.slice(0, TOP_CATEGORIES)
  const rest = shares.slice(TOP_CATEGORIES)
  const rows = [
    ...head.map((entry) => ({
      label: entry.category ?? t("mp.analytics.v3.categories.none"),
      revenue: entry.revenue,
      share: entry.share,
      previous: entry.revenue_previous,
    })),
    ...(rest.length
      ? [
          {
            label: t("mp.analytics.v3.categories.other", { count: rest.length }),
            revenue: rest.reduce((sum, entry) => sum + entry.revenue, 0),
            share: rest.reduce((sum, entry) => sum + entry.share, 0),
            previous: rest.every((entry) => entry.revenue_previous === null)
              ? null
              : rest.reduce((sum, entry) => sum + (entry.revenue_previous ?? 0), 0),
          },
        ]
      : []),
  ]

  return (
    <Panel
      title={t("mp.analytics.v3.categories.title")}
      hint={t("mp.analytics.v3.categories.hint")}
      footer={analytics.comparison.available && rows.length ? t("mp.analytics.v3.categories.footer", { days: analytics.period.days }) : null}
      testId="mp-analytics-categories"
    >
      {rows.length === 0 || total <= 0 ? (
        <Empty>{t("mp.analytics.v3.noSales")}</Empty>
      ) : (
        <ShareDonut rows={rows} currency={analytics.currency} locale={locale} label={t("mp.analytics.v3.categories.title")} />
      )}
    </Panel>
  )
}

/* -------------------------------------------------- средний чек по неделям */

export const ChecksByWeek = ({ analytics, locale }: { analytics: Analytics; locale: string }) => {
  const { t } = useTranslation()
  const weeks = analytics.by_week
  const previous = analytics.totals_previous?.avg_check ?? null
  const top = Math.max(1, previous ?? 0, ...weeks.map((week) => week.avg_check ?? 0))
  const money = (value: number) => moneyWhole(value, analytics.currency, locale)

  return (
    <Panel
      title={t("mp.analytics.v3.checks.title")}
      hint={t("mp.analytics.v3.checks.hint")}
      footer={t("mp.analytics.v3.checks.footer", {
        checks: count(analytics.checks.checks, locale),
        orders: count(analytics.totals.orders, locale),
      })}
      testId="mp-analytics-checks"
    >
      {previous !== null ? (
        <Text size="small">{t("mp.analytics.v3.checks.previous", { days: analytics.period.days, value: money(previous) })}</Text>
      ) : null}
      {weeks.every((week) => week.avg_check === null) ? (
        <Empty>{t("mp.analytics.v3.noSales")}</Empty>
      ) : (
        <div className="relative flex h-40 items-end gap-x-2">
          {previous !== null ? (
            <div
              className="border-ui-fg-muted pointer-events-none absolute inset-x-0 border-t border-dashed"
              style={{ bottom: `${(previous / top) * 100 * 0.8}%` }}
            />
          ) : null}
          {weeks.map((week) => (
            <div key={week.start} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-y-1">
              <Text size="xsmall" className="tabular-nums whitespace-nowrap">
                {week.avg_check === null ? "—" : money(week.avg_check)}
              </Text>
              <div
                className="bg-ui-fg-subtle w-full max-w-12 rounded-t-sm"
                style={{ height: `${((week.avg_check ?? 0) / top) * 80}%` }}
              />
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-x-2">
        {weeks.map((week) => (
          <div key={week.start} className="flex min-w-0 flex-1 flex-col items-center text-center">
            <Text size="xsmall" className="text-ui-fg-subtle leading-tight">
              {week.start === week.end
                ? dayShort(week.start, locale)
                : `${dayShort(week.start, locale)} – ${dayShort(week.end, locale)}`}
            </Text>
            {week.days < 7 ? (
              <Text size="xsmall" className="text-ui-fg-muted leading-tight">
                {t("mp.analytics.v3.checks.days", { count: week.days })}
              </Text>
            ) : null}
          </div>
        ))}
      </div>
    </Panel>
  )
}

/* ----------------------------------------------------------------- склады */

export const WarehouseSplit = ({ analytics, locale }: { analytics: Analytics; locale: string }) => {
  const { t } = useTranslation()
  const shares = analytics.by_warehouse
  const label = (warehouse: "wb" | "seller" | null) =>
    warehouse === "wb"
      ? t("mp.analytics.v3.warehouse.wb")
      : warehouse === "seller"
        ? t("mp.analytics.v3.warehouse.seller")
        : t("mp.analytics.v3.warehouse.unknown")
  const shade = (warehouse: "wb" | "seller" | null) => (warehouse === "wb" ? 1 : warehouse === "seller" ? 0.4 : 0.12)

  return (
    <Panel
      title={t("mp.analytics.v3.warehouse.title")}
      hint={t("mp.analytics.v3.warehouse.hint")}
      footer={t("mp.analytics.v3.warehouse.footer")}
      testId="mp-analytics-warehouse"
    >
      {shares.length === 0 ? (
        <Empty>{t("mp.analytics.v3.noSales")}</Empty>
      ) : (
        <>
          <div className="flex h-3 w-full gap-x-0.5 overflow-hidden rounded-sm">
            {shares.map((entry) => (
              <div
                key={entry.warehouse ?? "unknown"}
                className="bg-ui-fg-base h-full"
                style={{ width: `${entry.share}%`, opacity: shade(entry.warehouse) }}
              />
            ))}
          </div>
          <ul className="flex flex-col gap-y-3">
            {shares.map((entry) => (
              <li key={entry.warehouse ?? "unknown"} className="flex flex-col">
                <div className="flex items-center gap-x-2">
                  <span className="bg-ui-fg-base size-2.5 rounded-sm" style={{ opacity: shade(entry.warehouse) }} />
                  <Text size="small" className="flex-1">
                    {label(entry.warehouse)}
                  </Text>
                  <Text size="small" className="tabular-nums">
                    {pct(entry.share, locale)}
                  </Text>
                </div>
                <Text size="xsmall" className="text-ui-fg-muted pl-[18px] tabular-nums">
                  {t("mp.analytics.v3.warehouse.line", {
                    amount: moneyWhole(entry.revenue, analytics.currency, locale),
                    count: entry.orders,
                    orders: count(entry.orders, locale),
                  })}
                </Text>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  )
}

/* ---------------------------------------------------------------- регионы */

export const Regions = ({ analytics, locale }: { analytics: Analytics; locale: string }) => {
  const { t } = useTranslation()
  const regions = analytics.by_region
  const rows = [
    ...regions.top.map((entry) => ({ label: entry.region, share: entry.share, muted: false })),
    ...(regions.other
      ? [{ label: t("mp.analytics.v3.regions.other", { count: regions.other.regions }), share: regions.other.share, muted: true }]
      : []),
  ]

  return (
    <Panel
      title={t("mp.analytics.v3.regions.title")}
      hint={t("mp.analytics.v3.regions.hint")}
      footer={
        regions.orders > 0
          ? t("mp.analytics.v3.regions.footer", {
              share: pct(Math.round((regions.known_orders / regions.orders) * 100), locale),
              known: count(regions.known_orders, locale),
              orders: count(regions.orders, locale),
            })
          : null
      }
      testId="mp-analytics-regions"
    >
      {rows.length === 0 ? (
        <Empty>{t("mp.analytics.v3.regions.none")}</Empty>
      ) : (
        <ul className="flex flex-col gap-y-2.5">
          {rows.map((row) => (
            <li key={row.label} className="flex flex-col gap-y-1">
              <div className="flex items-center justify-between gap-x-2">
                <Text size="small" className={clx("truncate", row.muted && "text-ui-fg-subtle")}>
                  {row.label}
                </Text>
                <Text size="small" className="tabular-nums">
                  {pct(row.share, locale)}
                </Text>
              </div>
              <div className="bg-ui-bg-component h-1 w-full rounded-full">
                <div className="bg-ui-fg-subtle h-1 rounded-full" style={{ width: `${Math.min(100, row.share)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
