import { Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

// f15-overview-empty: one metric tile for OverviewStats — its own file so a
// touch to the card's look does not collide with the queries in
// overview-stats.tsx (component-decomposition-guard).
export const OverviewStatCard = ({
  label,
  value,
  isPending,
  testId,
}: {
  label: string
  value: number
  isPending: boolean
  testId: string
}) => {
  const { t } = useTranslation()

  return (
    <div
      className="flex flex-col gap-y-1 rounded-lg border p-4"
      data-testid={testId}
    >
      <Text size="small" className="text-ui-fg-subtle">
        {label}
      </Text>
      <Text size="large" weight="plus">
        {isPending ? t("overview.loading") : value}
      </Text>
    </div>
  )
}
