import { Alert } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import type { MarketplaceSyncWarning } from "../../../../hooks/api/marketplace-sync"

/**
 * What needs the owner's attention, at the top of the screen
 * (w16-mp-scheduler-ops, spec 2.6 and 2.7).
 *
 * The list is computed by the BACKEND (`/tenants/marketplaces/sync`), not
 * here: what counts as a warning has to be one rule, and a second copy written
 * in TSX would drift from the one the scheduler and the API already agree on.
 *
 * `error` for a key that has expired or an import that failed, `warning` for a
 * key running out and for a kind that has never run. An empty list is stated
 * out loud rather than rendered as a blank strip: «нет предупреждений» is an
 * answer, an empty area is not (rule 20a).
 */
export const MpSyncWarnings = ({ warnings }: { warnings: MarketplaceSyncWarning[] }) => {
  const { t } = useTranslation()

  if (!warnings.length) {
    return (
      <Alert variant="success">{t("marketplaceSync.noWarnings")}</Alert>
    )
  }

  return (
    <div className="flex flex-col gap-y-2">
      {warnings.map((warning) => (
        <Alert
          key={`${warning.marketplace}-${warning.kind ?? "*"}-${warning.type}`}
          variant={
            warning.type === "key_expired" || warning.type === "failed" ? "error" : "warning"
          }
        >
          {warning.text}
        </Alert>
      ))}
    </div>
  )
}
