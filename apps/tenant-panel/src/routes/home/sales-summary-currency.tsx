import { Button, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { getStylizedAmount } from "../../lib/money-amount-helpers"
import type { AnalyticsCurrencyBucket } from "../../hooks/api/analytics-summary"

type SalesSummaryCurrencyProps = {
  /** Every currency the shop has ever taken money in. */
  currencies: string[]
  /** The one every number on the screen is in right now. */
  selected: string | null
  onSelect: (currency: string) => void
  disabled: boolean
}

/**
 * The currency switch, shown only when the shop has actually taken money in
 * more than one currency (b12-analytics-accuracy).
 *
 * A single-currency shop — which is every shop we run today — sees nothing new
 * here at all.
 */
export const SalesSummaryCurrencyPicker = ({
  currencies,
  selected,
  onSelect,
  disabled,
}: SalesSummaryCurrencyProps) => {
  if (currencies.length < 2) {
    return null
  }

  return (
    <div
      className="flex gap-x-1 border-l border-ui-border-base pl-2"
      data-testid="sales-summary-currency-picker"
    >
      {currencies.map((code) => (
        <Button
          key={code}
          size="small"
          variant={selected === code ? "primary" : "secondary"}
          disabled={disabled}
          onClick={() => onSelect(code)}
          data-testid={`sales-summary-currency-${code}`}
        >
          {code.toUpperCase()}
        </Button>
      ))}
    </div>
  )
}

type SalesSummaryOtherCurrenciesProps = {
  breakdown: AnalyticsCurrencyBucket[]
  selected: string | null
}

/**
 * What the cards above do NOT contain: the same period's money in every other
 * currency, each with its own total and order count.
 *
 * This line is the honest half of the split. Before it, the screen added the
 * currencies together and labelled the sum with one of them; showing one
 * currency and saying nothing about the rest would swap that lie for a
 * quieter one (rule 20a), so the orders that are not on the cards are named
 * here instead of disappearing.
 */
export const SalesSummaryOtherCurrencies = ({
  breakdown,
  selected,
}: SalesSummaryOtherCurrenciesProps) => {
  const { t } = useTranslation()

  const others = breakdown.filter(
    (bucket) => bucket.currency_code !== selected && bucket.order_count > 0
  )

  if (others.length === 0) {
    return null
  }

  return (
    <Text
      size="small"
      className="text-ui-fg-subtle"
      data-testid="sales-summary-other-currencies"
    >
      {t("salesSummary.otherCurrenciesNote", {
        list: others
          .map((bucket) =>
            t("salesSummary.otherCurrencyItem", {
              amount: getStylizedAmount(bucket.revenue, bucket.currency_code),
              count: bucket.order_count,
            })
          )
          .join(", "),
      })}
    </Text>
  )
}
