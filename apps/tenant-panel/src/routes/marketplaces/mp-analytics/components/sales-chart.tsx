import { ChevronLeft, ChevronRight } from "@medusajs/icons"
import { IconButton, Text } from "@medusajs/ui"
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import { useTranslation } from "react-i18next"

import type { MpAnalyticsResponse } from "../../../../hooks/api/marketplace-section"
import { count, dayShort, dayWithWeekday, moneyCompact, moneyWhole } from "./format"

/**
 * Динамика по дням (v3, t-2026-10-16-36): столбик на день периода и пунктир
 * прошлого периода той же длины.
 *
 * Свой SVG, а не библиотека графиков: в зависимостях панели её нет, а ввозить
 * её ради одного экрана — это 200 КБ и ещё одна вещь, которая ломается при
 * обновлении Admin.
 *
 * ДЕНЬ ВИДЕН СРАЗУ (спека UX, F1/F2). Браузерная подсказка `<title>`
 * появлялась через секунду и не меняла столбик. Теперь наведение, касание или
 * стрелка клавиатуры выбирает ближайший день в тот же кадр: строка над
 * графиком печатает его числа, выбранный столбик яркий, остальные бледнеют.
 * На телефоне столбик уже 44 px, поэтому рядом кнопки ‹ › по 44 px.
 *
 * КАЖДЫЙ ДЕНЬ ПЕРИОДА НА МЕСТЕ, включая нулевой: ноль — измеренный ноль
 * (правило 20a). Отмены — бледная шапка над столбиком: не выручка, но и не
 * пустота.
 */

type Day = MpAnalyticsResponse["by_day"][number]

type Props = {
  days: Day[]
  /** The previous period, day by day in the same order; `null` — no comparison. */
  previous: Day[] | null
  currency: string | null
  locale: string
}

const HEIGHT = 220
const AXIS = 64
const BOTTOM = 24
const TOP = 8

/** The container's width, followed: the chart fills its card on every screen. */
const useWidth = () => {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const node = ref.current
    if (!node) {
      return
    }
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return { ref, width }
}

/** 0, the middle and the top of the axis, on a round step. */
const niceMax = (value: number): number => {
  if (value <= 0) {
    return 1
  }
  const power = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 2.5, 5, 10].find((m) => m * power >= value) ?? 10
  return step * power
}

export const SalesChart = ({ days, previous, currency, locale }: Props) => {
  const { t } = useTranslation()
  const { ref, width } = useWidth()
  const [active, setActive] = useState<number | null>(null)

  const top = useMemo(() => {
    const values = days.map((day) => day.revenue + day.cancelled_revenue)
    for (const day of previous ?? []) {
      values.push(day.revenue)
    }
    return niceMax(Math.max(0, ...values))
  }, [days, previous])

  const plot = Math.max(0, width - AXIS)
  const slot = days.length ? plot / days.length : 0
  const bar = Math.max(2, Math.min(28, slot * 0.72))
  const y = (value: number) => TOP + HEIGHT - (value / top) * HEIGHT
  const xOf = (index: number) => AXIS + index * slot + slot / 2

  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const index = Math.floor((event.clientX - box.left - AXIS) / Math.max(slot, 1))
    setActive(Math.min(days.length - 1, Math.max(0, index)))
  }

  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault()
      const step = event.key === "ArrowRight" ? 1 : -1
      setActive((now) => Math.min(days.length - 1, Math.max(0, (now ?? days.length - 1) + step)))
    } else if (event.key === "Escape") {
      setActive(null)
    }
  }

  const step = (by: number) =>
    setActive((now) => Math.min(days.length - 1, Math.max(0, (now ?? days.length - 1) + by)))

  const money = (value: number) => moneyWhole(value, currency, locale)
  const shown = active === null ? null : days[active]
  const before = active === null || !previous ? null : previous[active]

  const readout = shown
    ? [
        t("mp.analytics.chart.dayReadout", {
          day: dayWithWeekday(shown.day, locale),
          revenue: money(shown.revenue),
          orders: count(shown.orders, locale),
        }),
        shown.cancelled_units > 0
          ? t("mp.analytics.chart.dayCancelled", {
              units: count(shown.cancelled_units, locale),
              amount: money(shown.cancelled_revenue),
            })
          : null,
        before
          ? t("mp.analytics.chart.dayBefore", { days: days.length, revenue: money(before.revenue) })
          : null,
      ]
        .filter(Boolean)
        .join("; ")
    : null

  const line =
    previous && previous.length === days.length
      ? previous.map((day, index) => `${index ? "L" : "M"}${xOf(index).toFixed(1)},${y(day.revenue).toFixed(1)}`).join(" ")
      : null

  /** Five dates along the axis, fewer on a short period: the same day is never printed twice. */
  const labels = [
    ...new Set(
      days.length
        ? [0, Math.floor(days.length / 4), Math.floor(days.length / 2), Math.floor((days.length * 3) / 4), days.length - 1]
        : []
    ),
  ]

  return (
    <div className="flex flex-col gap-y-2">
      <div className="flex min-h-11 items-center gap-x-2">
        <IconButton
          size="large"
          variant="transparent"
          className="size-11 shrink-0 md:hidden"
          aria-label={t("mp.analytics.chart.prevDay")}
          onClick={() => step(-1)}
        >
          <ChevronLeft />
        </IconButton>
        <Text size="small" className="text-ui-fg-subtle min-w-0 flex-1 tabular-nums" aria-live="polite">
          {readout ?? t("mp.analytics.chart.hint")}
        </Text>
        <IconButton
          size="large"
          variant="transparent"
          className="size-11 shrink-0 md:hidden"
          aria-label={t("mp.analytics.chart.nextDay")}
          onClick={() => step(1)}
        >
          <ChevronRight />
        </IconButton>
      </div>
      <div ref={ref} className="w-full">
        {width > 0 ? (
          <svg
            width={width}
            height={TOP + HEIGHT + BOTTOM}
            role="img"
            tabIndex={0}
            aria-label={t("mp.analytics.chart.revenueLabel")}
            className="touch-pan-y outline-none focus-visible:shadow-borders-focus rounded-md"
            onPointerMove={pick}
            onPointerDown={pick}
            onPointerLeave={(event) => (event.pointerType === "mouse" ? setActive(null) : undefined)}
            onKeyDown={onKey}
          >
            {[0, 0.5, 1].map((share) => (
              <g key={share}>
                <line
                  x1={AXIS}
                  x2={width}
                  y1={y(top * share)}
                  y2={y(top * share)}
                  className={share === 0 ? "stroke-ui-border-strong" : "stroke-ui-border-base"}
                  strokeDasharray={share === 0 ? undefined : "2 3"}
                />
                <text x={AXIS - 8} y={y(top * share) + 4} textAnchor="end" className="fill-ui-fg-muted text-[11px]">
                  {share === 0 ? "0" : moneyCompact(top * share, currency, locale)}
                </text>
              </g>
            ))}
            {days.map((day, index) => {
              const x = xOf(index) - bar / 2
              const dim = active !== null && active !== index
              return (
                <g key={day.day} opacity={dim ? 0.35 : 1}>
                  <rect
                    x={x}
                    width={bar}
                    y={y(day.revenue + day.cancelled_revenue)}
                    height={Math.max(0, y(day.revenue) - y(day.revenue + day.cancelled_revenue))}
                    className="fill-ui-tag-orange-icon opacity-40"
                  />
                  <rect
                    x={x}
                    width={bar}
                    y={y(day.revenue)}
                    height={Math.max(0, TOP + HEIGHT - y(day.revenue))}
                    className={active === index ? "fill-ui-fg-base" : "fill-ui-fg-subtle"}
                  />
                </g>
              )
            })}
            {line ? (
              <path d={line} fill="none" className="stroke-ui-fg-muted" strokeWidth={1.25} strokeDasharray="4 3" />
            ) : null}
            {active !== null ? (
              <line
                x1={xOf(active)}
                x2={xOf(active)}
                y1={TOP}
                y2={TOP + HEIGHT}
                className="stroke-ui-fg-muted"
                strokeWidth={1}
              />
            ) : null}
            {labels.map((index, position) => (
              <text
                key={`${index}-${position}`}
                x={xOf(index)}
                y={TOP + HEIGHT + 16}
                textAnchor={position === 0 ? "start" : position === labels.length - 1 ? "end" : "middle"}
                className={`fill-ui-fg-muted text-[11px] ${position % 2 === 1 ? "max-md:hidden" : ""}`}
              >
                {dayShort(days[index].day, locale)}
              </text>
            ))}
          </svg>
        ) : (
          <div style={{ height: TOP + HEIGHT + BOTTOM }} />
        )}
      </div>
      <Text size="xsmall" className="text-ui-fg-muted">
        {t("mp.analytics.chart.legendV3")}
      </Text>
    </div>
  )
}
