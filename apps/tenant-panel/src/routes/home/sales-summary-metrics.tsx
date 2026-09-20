import { Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { getStylizedAmount } from "../../lib/money-amount-helpers"
import type { AnalyticsAggregate } from "../../hooks/api/analytics-summary"

type SalesSummaryMetricsProps = {
  current: AnalyticsAggregate
  change: { revenue_pct: number | null; order_count_pct: number | null; aov_pct: number | null }
  /** Orders of the same period that were cancelled, kept out of the three cards. */
  canceled: { order_count: number; revenue: number }
  currencyCode: string
}

const ChangeBadge = ({ pct }: { pct: number | null }) => {
  if (pct === null) {
    return null
  }

  const positive = pct >= 0
  return (
    <Text
      size="xsmall"
      className={positive ? "text-ui-tag-green-text" : "text-ui-tag-red-text"}
    >
      {positive ? "+" : ""}
      {pct}%
    </Text>
  )
}

/**
 * Revenue, order count and AOV for the current period, each with the change
 * against the previous one, and under them the cancelled orders of that same
 * period.
 *
 * The cancelled line exists so that a zero on the cards is readable: a shop
 * whose orders were all cancelled used to see its cancelled money ADDED to
 * revenue, and hiding it instead would swap one wrong number for an
 * unexplained zero (b01-owner-numbers, rule 20a).
 */
export const SalesSummaryMetrics = ({
  current,
  change,
  canceled,
  currencyCode,
}: SalesSummaryMetricsProps) => {
  const { t } = useTranslation()

  const cards = [
    {
      key: "revenue",
      label: t("salesSummary.revenue"),
      value: getStylizedAmount(current.revenue, currencyCode),
      pct: change.revenue_pct,
    },
    {
      key: "orders",
      label: t("salesSummary.orders"),
      value: String(current.order_count),
      pct: change.order_count_pct,
    },
    {
      key: "aov",
      label: t("salesSummary.aov"),
      value: getStylizedAmount(current.aov, currencyCode),
      pct: change.aov_pct,
    },
  ]

  return (
    <div className="flex flex-col gap-y-2">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <div key={card.key} className="flex flex-col gap-y-1 rounded-lg border p-4">
            <Text size="small" className="text-ui-fg-subtle">
              {card.label}
            </Text>
            <div className="flex items-baseline gap-x-2">
              <Text size="large" weight="plus">
                {card.value}
              </Text>
              <ChangeBadge pct={card.pct} />
            </div>
          </div>
        ))}
      </div>
      {canceled.order_count > 0 ? (
        <Text
          size="small"
          className="text-ui-fg-subtle"
          data-testid="sales-summary-canceled"
        >
          {t("salesSummary.canceledNote", {
            count: canceled.order_count,
            amount: getStylizedAmount(canceled.revenue, currencyCode),
          })}
        </Text>
      ) : null}
    </div>
  )
}
