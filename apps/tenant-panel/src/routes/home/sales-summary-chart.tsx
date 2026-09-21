import { Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { getStylizedAmount } from "../../lib/money-amount-helpers"

type SalesSummaryChartProps = {
  daily: { date: string; revenue: number; order_count: number }[]
  currencyCode: string
}

/**
 * A plain CSS bar chart, no charting library: 30 bars at most, one number
 * each, and the repository has none installed (rule 32a — YAGNI, this does
 * not need one). Every bar is real data from the backend — never invented
 * (step 6).
 *
 * o21-owner-panel-ux (lead review H1): one bar per day with the day under it
 * and a zero line, so an empty day is an empty slot on the line and not a gap
 * in the picture. A period of one day is said in a sentence: a single bar is
 * always a full-height block and reads as a broken chart.
 */
export const SalesSummaryChart = ({ daily, currencyCode }: SalesSummaryChartProps) => {
  const { t, i18n } = useTranslation()
  const max = Math.max(1, ...daily.map((day) => day.revenue))

  const dayLabel = (date: string, withMonth: boolean) =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString(i18n.language, {
      day: "numeric",
      ...(withMonth ? { month: "short" } : {}),
      timeZone: "UTC",
    })

  if (daily.length <= 1) {
    const day = daily[0]
    return (
      <div className="rounded-lg border p-4" data-testid="sales-summary-chart">
        <Text size="small" className="text-ui-fg-subtle">
          {day
            ? t("salesSummary.singleDay", {
                date: dayLabel(day.date, true),
                revenue: getStylizedAmount(day.revenue, currencyCode),
                count: day.order_count,
              })
            : t("salesSummary.noDays")}
        </Text>
      </div>
    )
  }

  // A label under every bar fits a week; a month shows every fifth day.
  const labelEvery = daily.length <= 10 ? 1 : 5

  return (
    <div className="flex flex-col gap-y-2 rounded-lg border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <Text size="small" weight="plus">
          {t("salesSummary.chartTitle")}
        </Text>
        <Text size="xsmall" className="text-ui-fg-muted">
          {t("salesSummary.chartMax", { revenue: getStylizedAmount(max, currencyCode) })}
        </Text>
      </div>
      <div className="flex" data-testid="sales-summary-chart">
        {daily.map((day, index) => {
          const heightPct = Math.round((day.revenue / max) * 100)
          const labelled = index % labelEvery === 0 || index === daily.length - 1

          return (
            <div
              key={day.date}
              className="flex min-w-0 flex-1 flex-col items-center gap-y-1"
              title={`${dayLabel(day.date, true)}: ${getStylizedAmount(day.revenue, currencyCode)}`}
            >
              {/* The slot is h-32 by itself, so the bar's percentage height
                  has something to resolve against; its bottom border is the
                  zero line, drawn for empty days too. */}
              <div className="border-ui-border-strong flex h-32 w-full flex-col justify-end border-b">
                <div
                  className="bg-ui-tag-blue-icon mx-auto w-[calc(100%-4px)] max-w-8 rounded-t"
                  style={{ height: `${Math.max(heightPct, day.revenue > 0 ? 2 : 0)}%` }}
                />
              </div>
              <span className="text-ui-fg-muted txt-compact-xsmall h-4 whitespace-nowrap tabular-nums">
                {labelled ? dayLabel(day.date, false) : ""}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
