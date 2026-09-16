import { Badge, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import type { MarketplaceSyncKind } from "../../../../hooks/api/marketplace-sync"

const STATUS_COLOR: Record<string, "green" | "red" | "orange" | "grey"> = {
  succeeded: "green",
  failed: "red",
  rate_limited: "orange",
  running: "grey",
}

/**
 * The state of one kind (w16-mp-scheduler-ops).
 *
 * FOUR values, not two. «Ни разу не запускалась» is a state of its own and is
 * never rendered as a zero (rule 20a), and a rate limit is amber rather than
 * red: it is the marketplace's own schedule, not our defect, and a red badge
 * on it sends the owner looking for a bug that is not there — the lesson w03's
 * acceptance round paid for.
 */
export const MpSyncStateCell = ({ row }: { row: MarketplaceSyncKind }) => {
  const { t } = useTranslation()

  if (row.status === null) {
    return (
      <Text className="text-ui-fg-muted" size="small">
        {t("marketplaceSync.neverRan")}
      </Text>
    )
  }

  return (
    <div className="flex items-center gap-x-2">
      <Badge color={STATUS_COLOR[row.status] ?? "grey"} size="2xsmall">
        {t(`marketplaces.statuses.${row.status}`, { defaultValue: row.status })}
      </Badge>
      {row.is_fixture ? (
        <Badge color="orange" size="2xsmall">
          {t("marketplaces.sync.fixture")}
        </Badge>
      ) : null}
      {row.attempts && row.attempts > 1 ? (
        <Text className="text-ui-fg-subtle" size="xsmall">
          {t("marketplaceSync.attempts", { count: row.attempts })}
        </Text>
      ) : null}
    </div>
  )
}
