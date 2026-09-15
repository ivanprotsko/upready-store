import { DatePicker, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

export type CustomRange = { from: Date | null; to: Date | null }

type SalesSummaryCustomRangeProps = {
  range: CustomRange
  onChange: (range: CustomRange) => void
}

/**
 * t17-analytics round 1, finding 2: the step-5 requirement is "today, 7 days,
 * 30 days, CUSTOM" — the panel only ever offered the first three. Two plain
 * `DatePicker`s (the repository's existing single-date primitive; there is no
 * range variant, and building one is out of scope for a fourth period key).
 */
export const SalesSummaryCustomRange = ({ range, onChange }: SalesSummaryCustomRangeProps) => {
  const { t } = useTranslation()

  return (
    <div className="flex items-center gap-x-2">
      <Text size="small" className="text-ui-fg-subtle">
        {t("salesSummary.customFrom")}
      </Text>
      <DatePicker
        value={range.from}
        onChange={(value) => onChange({ ...range, from: value })}
        maxValue={range.to ?? undefined}
        data-testid="sales-summary-custom-from"
      />
      <Text size="small" className="text-ui-fg-subtle">
        {t("salesSummary.customTo")}
      </Text>
      <DatePicker
        value={range.to}
        onChange={(value) => onChange({ ...range, to: value })}
        minValue={range.from ?? undefined}
        data-testid="sales-summary-custom-to"
      />
    </div>
  )
}
