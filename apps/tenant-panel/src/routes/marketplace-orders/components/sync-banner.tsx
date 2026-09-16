import { Alert, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import type { FeedConnection } from "../../../hooks/api/marketplace-orders"

/**
 * What the owner must be told about each marketplace BEFORE they read the
 * table (w15-mp-orders-desk).
 *
 * The rule this component exists for: «Report a zero as «нет заказов» when the
 * sync failed — a failed run is a red row, not an empty table» (rule 20a). So
 * three states, three different sentences, and none of them silent:
 *
 *   no key           «нет подключения» — nothing was ever imported, and that is
 *                    not the same as a marketplace with no orders.
 *   failed run       red, with the marketplace's own error text.
 *   fixture run      the rows on the screen came from recorded answers, not
 *                    from the marketplace. Saying nothing here would let a
 *                    demo read as live data.
 *
 * A marketplace that is connected and whose last import succeeded says nothing
 * at all: a banner that is always there stops being read.
 */
export const SyncBanner = ({ connections }: { connections: FeedConnection[] }) => {
  const { t } = useTranslation()

  const notable = connections.filter(
    (one) =>
      !one.connected ||
      !one.last_run ||
      one.last_run.status === "failed" ||
      one.last_run.is_fixture
  )

  if (notable.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-y-2 px-6 py-4">
      {notable.map((one) => {
        if (!one.connected) {
          return (
            <Alert key={one.marketplace} variant="info" data-testid={`conn-${one.marketplace}`}>
              <Text size="small">
                {t("marketplaceOrders.connection.missing", { marketplace: one.label })}
              </Text>
            </Alert>
          )
        }

        if (!one.last_run) {
          return (
            <Alert key={one.marketplace} variant="warning" data-testid={`conn-${one.marketplace}`}>
              <Text size="small">
                {t("marketplaceOrders.connection.neverRun", { marketplace: one.label })}
              </Text>
            </Alert>
          )
        }

        if (one.last_run.status === "failed") {
          return (
            <Alert key={one.marketplace} variant="error" data-testid={`conn-${one.marketplace}`}>
              <Text size="small">
                {t("marketplaceOrders.connection.failed", {
                  marketplace: one.label,
                  error: one.last_run.error ?? t("marketplaceOrders.connection.noErrorText"),
                })}
              </Text>
            </Alert>
          )
        }

        return (
          <Alert key={one.marketplace} variant="warning" data-testid={`conn-${one.marketplace}`}>
            <Text size="small">
              {t("marketplaceOrders.connection.fixture", { marketplace: one.label })}
            </Text>
          </Alert>
        )
      })}
    </div>
  )
}
