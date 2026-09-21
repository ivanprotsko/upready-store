import { Alert, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import type { FeedConnection } from "../../../hooks/api/marketplace-orders"
import {
  SupportDetails,
  marketplaceErrorKey,
} from "../../../components/common/support-details"

/**
 * What the owner is told about each marketplace BEFORE they read the table
 * (w15-mp-orders-desk).
 *
 * The rule this component exists for: «a failed run is a red row, not an empty
 * table» (rule 20a). An empty column under «Wildberries» has five different
 * causes, and the owner cannot tell them apart by looking — so the screen names
 * the cause.
 *
 * WHICH cause it is, is decided in the backend by `connectionNotice()` in
 * `modules/marketplace/order-feed.ts`, and covered there by unit tests. This
 * component only renders it. The decision lives in a pure function precisely
 * because it is a rule about what must never be silent, and such a rule has to
 * be provable rather than promised.
 *
 * A marketplace that is connected and whose last import succeeded says nothing
 * at all: a banner that is always there stops being read.
 */

const VARIANT: Record<string, "info" | "warning" | "error"> = {
  missing: "info",
  never_run: "warning",
  failed: "error",
  rate_limited: "warning",
  fixture: "warning",
}

export const SyncBanner = ({ connections }: { connections: FeedConnection[] }) => {
  const { t } = useTranslation()

  const notable = connections.filter((one) => one.notice !== null)

  if (notable.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-y-2 px-6 py-4">
      {notable.map((one) => (
        <Alert
          key={one.marketplace}
          variant={VARIANT[one.notice as string] ?? "warning"}
          data-testid={`conn-${one.marketplace}`}
        >
          <Text size="small">
            {t(`marketplaceOrders.connection.${one.notice}`, {
              marketplace: one.label,
              // The owner reads the reason in plain words; the raw answer of
              // the marketplace is below, closed (o21-owner-panel-ux, P3).
              error: t(marketplaceErrorKey(one.last_run?.error)),
            })}
          </Text>
          {one.notice === "failed" && one.last_run?.error ? (
            <SupportDetails text={`${one.marketplace}: ${one.last_run.error}`} />
          ) : null}
        </Alert>
      ))}
    </div>
  )
}
