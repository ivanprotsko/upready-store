import { Alert } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import type { MarketplaceSyncWarning } from "../../../../hooks/api/marketplace-sync"

/** One warning as a sentence, with the kind in the owner's own words. */
const sentence = (
  warning: MarketplaceSyncWarning,
  t: (key: string, options?: Record<string, unknown>) => string
): string => {
  const kind = warning.kind
    ? t(`marketplaces.kinds.${warning.kind}`, { defaultValue: warning.kind })
    : ""
  const where = `${warning.marketplace_label} / ${kind}`

  switch (warning.type) {
    case "no_key":
      return t("marketplaceSync.warnings.noKey", { label: warning.marketplace_label })
    case "key_expired":
      return t("marketplaceSync.warnings.keyExpired", { label: warning.marketplace_label })
    case "key_expiring":
      return t("marketplaceSync.warnings.keyExpiring", {
        label: warning.marketplace_label,
        days: warning.expires_in_days ?? 0,
      })
    case "failed":
      return t("marketplaceSync.warnings.failed", { where, error: warning.error ?? "" })
    case "never_ran":
      return t("marketplaceSync.warnings.neverRan", { where })
    default:
      // An unknown type is still shown, in the backend's own words: a warning
      // nobody rendered is a warning nobody saw (rule 20a).
      return warning.text
  }
}

/**
 * What needs the owner's attention, at the top of the screen
 * (w16-mp-scheduler-ops, spec 2.6 and 2.7).
 *
 * WHAT counts as a warning is decided by the BACKEND
 * (`/tenants/marketplaces/sync`): one rule, not a second copy written in TSX
 * that would drift from the one the scheduler and the API already agree on.
 * HOW IT READS is decided here, because only the panel has the catalog that
 * turns `fbs_orders` into «Сборочные задания FBS» and only it knows the
 * owner's locale (rule 18e).
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
          {sentence(warning, t)}
        </Alert>
      ))}
    </div>
  )
}
