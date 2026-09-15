import { Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

type SalesSummaryChartProps = {
  daily: { date: string; revenue: number; order_count: number }[]
}

/**
 * A plain CSS bar chart, no charting library: 30 bars at most, one number
 * each, and the repository has none installed (rule 32a — YAGNI, this does
 * not need one). Every bar is real data from the backend, height zero
 * included — never invented (step 6).
 */
export const SalesSummaryChart = ({ daily }: SalesSummaryChartProps) => {
  const { t, i18n } = useTranslation()
  const max = Math.max(1, ...daily.map((day) => day.revenue))

  return (
    <div className="flex flex-col gap-y-2 rounded-lg border p-4">
      <Text size="small" weight="plus">
        {t("salesSummary.chartTitle")}
      </Text>
      {/* `items-stretch` (the default, stated explicitly): each bar's
          percentage height resolves against ITS OWN parent, so that parent
          must actually BE h-32 tall — `items-end` here would size it to its
          content instead and every percentage height would resolve against
          zero (measured: every bar invisible until this was fixed). */}
      <div className="flex h-32 items-stretch gap-1" data-testid="sales-summary-chart">
        {daily.map((day) => {
          const heightPct = Math.round((day.revenue / max) * 100)
          const label = new Date(`${day.date}T00:00:00Z`).toLocaleDateString(i18n.language, {
            day: "numeric",
            month: "short",
          })

          return (
            <div
              key={day.date}
              className="group relative flex flex-1 flex-col justify-end"
              title={`${label}: ${day.revenue}`}
            >
              <div
                className="w-full rounded-t bg-ui-tag-blue-icon"
                style={{ height: `${Math.max(heightPct, day.revenue > 0 ? 2 : 0)}%` }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
