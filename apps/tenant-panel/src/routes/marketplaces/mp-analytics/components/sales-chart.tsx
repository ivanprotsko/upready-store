import { Text } from "@medusajs/ui"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import type { MpAnalyticsResponse } from "../../../../hooks/api/marketplace-section"

/**
 * Продажи по дням — столбик на день периода (w19-mp-analytics).
 *
 * Свой SVG, а не библиотека графиков: в зависимостях панели её нет, а ввозить
 * её ради одного экрана — это 200 КБ и ещё одна вещь, которая ломается при
 * обновлении Admin. Столбик рисуется из тех же чисел, что стоят в таблице под
 * ним, поэтому график и таблица разойтись не могут.
 *
 * КАЖДЫЙ ДЕНЬ ПЕРИОДА НА МЕСТЕ, включая нулевой: пропуск в линии читался бы
 * как «в этот день не считали», а ноль — это измеренный ноль (правило 20a).
 * Отмены рисуются вторым, более бледным столбиком поверх — они не выручка, но
 * и не пустота.
 *
 * Перенесён с экрана w19 на «Wildberries → Аналитика» (task-06): день — это
 * `by_day[]` ответа одной площадки, без разбивки по площадкам.
 */

type Day = MpAnalyticsResponse["by_day"][number]

type Props = {
  days: Day[]
  currency: string | null
  locale: string
  /** Подпись оси: что именно отложено по высоте. */
  measure: "revenue" | "units"
}

const HEIGHT = 160
const GAP = 2

/**
 * `YYYY-MM-DD` -> «18 авг.» по локали. День печатается как ДЕНЬ: момент
 * сдвинулся бы часовым поясом, а подпись оси рядом с таблицей, где даты уже
 * человеческие, не должна быть единственным сырым значением на экране.
 */
const shortDay = (day: string | undefined, locale: string) => {
  if (!day) {
    return ""
  }
  const [year, month, date] = day.split("-").map(Number)
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(
    new Date(year, (month ?? 1) - 1, date ?? 1)
  )
}

export const SalesChart = ({ days, currency, locale, measure }: Props) => {
  const { t } = useTranslation()
  const { max, width } = useMemo(() => {
    const values = days.map((day) =>
      measure === "revenue" ? day.revenue + day.cancelled_revenue : day.units + day.cancelled_units
    )
    return { max: Math.max(1, ...values), width: Math.max(days.length * 12, 240) }
  }, [days, measure])

  const format = (value: number) =>
    measure === "revenue"
      ? new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value) +
        (currency ? ` ${currency}` : "")
      : `${new Intl.NumberFormat(locale).format(value)} ${t("mp.units.pcs")}`

  const barWidth = Math.max(4, Math.floor(width / Math.max(days.length, 1)) - GAP)

  return (
    <div className="overflow-x-auto">
      <svg
        className="min-w-full"
        height={HEIGHT + 22}
        role="img"
        aria-label={measure === "revenue" ? t("mp.analytics.chart.revenueLabel") : t("mp.analytics.chart.unitsLabel")}
        width={width}
      >
        {days.map((day, index) => {
          const value = measure === "revenue" ? day.revenue : day.units
          const cancelled =
            measure === "revenue" ? day.cancelled_revenue : day.cancelled_units
          const x = index * (barWidth + GAP)
          const height = Math.round((value / max) * HEIGHT)
          const cancelledHeight = Math.round((cancelled / max) * HEIGHT)

          return (
            <g key={day.day}>
              {/* Отмены — бледной шапкой над столбиком выручки. */}
              <rect
                className="fill-ui-tag-orange-icon opacity-40"
                height={cancelledHeight}
                width={barWidth}
                x={x}
                y={HEIGHT - height - cancelledHeight}
              />
              <rect
                className="fill-ui-fg-interactive"
                height={height}
                width={barWidth}
                x={x}
                y={HEIGHT - height}
              >
                <title>
                  {cancelled > 0
                    ? t("mp.analytics.chart.barCancelled", {
                        day: shortDay(day.day, locale),
                        value: format(value),
                        cancelled: format(cancelled),
                      })
                    : t("mp.analytics.chart.bar", { day: shortDay(day.day, locale), value: format(value) })}
                </title>
              </rect>
            </g>
          )
        })}
        {/* Подписи только у краёв: тридцать дат подряд не читаются. */}
        <text className="fill-ui-fg-muted text-[10px]" x={0} y={HEIGHT + 16}>
          {shortDay(days[0]?.day, locale)}
        </text>
        <text
          className="fill-ui-fg-muted text-[10px]"
          textAnchor="end"
          x={width}
          y={HEIGHT + 16}
        >
          {shortDay(days[days.length - 1]?.day, locale)}
        </text>
      </svg>
      <Text className="text-ui-fg-muted" size="xsmall">
        {t("mp.analytics.chart.legend", { max: format(max) })}
      </Text>
    </div>
  )
}
