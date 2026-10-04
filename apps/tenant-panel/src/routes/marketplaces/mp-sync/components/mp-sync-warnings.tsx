import { Key } from "@medusajs/icons"
import { Alert, Button } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import {
  SupportDetails,
  marketplaceErrorKey,
  marketplaceErrorReason,
} from "../../../../components/common/support-details"
import type { MarketplaceSyncWarning } from "../../../../hooks/api/marketplace-sync"
import { useSyncLabels } from "./kind-label"

/** One warning about the key as a sentence. */
const keySentence = (
  warning: MarketplaceSyncWarning,
  t: (key: string, options?: Record<string, unknown>) => string
): string => {
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
    default:
      // An unknown type is still shown, in the backend's own words: a warning
      // nobody rendered is a warning nobody saw (rule 20a).
      return warning.text
  }
}

const KEY_TYPES: MarketplaceSyncWarning["type"][] = ["no_key", "key_expired", "key_expiring"]

/**
 * What needs the owner's attention, above the schedule
 * (w16-mp-scheduler-ops, spec 2.6 and 2.7; moved into «Обновление» by task-07
 * of ask-20261005-023327-f02b).
 *
 * WHAT counts as a warning is decided by the BACKEND
 * (`/tenants/marketplaces/:marketplace/sync`): one rule, not a second copy
 * written in TSX that would drift from the one the scheduler and the API
 * already agree on. HOW IT READS is decided here, because only the panel has
 * the catalog that turns `fbs_orders` into «Сборочные задания FBS» and only it
 * knows the owner's locale (rule 18e).
 *
 * `error` for a missing or expired key and for an import that failed,
 * `warning` for a key running out and for kinds that have never come in. A
 * warning about the key carries the button to the key (`keyHref`), because
 * that is the one thing the owner can do about it. An empty list is stated
 * out loud rather than rendered as a blank strip (rule 20a).
 */
export const MpSyncWarnings = ({
  warnings,
  keyHref,
}: {
  warnings: MarketplaceSyncWarning[]
  keyHref?: string
}) => {
  const { t } = useTranslation()
  const { kindLabel } = useSyncLabels()

  if (!warnings.length) {
    return <Alert variant="success">{t("marketplaceSync.noWarnings")}</Alert>
  }

  // One cause, one message (o21-owner-panel-ux, P3): a rejected key fails every
  // kind of data at once, and nine red banners with the same raw answer told
  // the owner nothing. Failures are folded per marketplace and reason, kinds
  // that never came in per marketplace; the raw answers stay available,
  // closed, for support.
  const failures = new Map<string, MarketplaceSyncWarning[]>()
  const neverRan = new Map<string, MarketplaceSyncWarning[]>()
  const keys: MarketplaceSyncWarning[] = []
  const others: MarketplaceSyncWarning[] = []
  for (const warning of warnings) {
    if (warning.type === "failed") {
      const key = `${warning.marketplace}:${marketplaceErrorReason(warning.error)}`
      failures.set(key, [...(failures.get(key) ?? []), warning])
    } else if (warning.type === "never_ran") {
      neverRan.set(warning.marketplace, [...(neverRan.get(warning.marketplace) ?? []), warning])
    } else if (KEY_TYPES.includes(warning.type)) {
      keys.push(warning)
    } else {
      others.push(warning)
    }
  }

  const kindsOf = (group: MarketplaceSyncWarning[]) =>
    group.map((warning) => (warning.kind ? kindLabel(warning.kind) : "")).filter(Boolean).join(", ")

  return (
    <div className="flex flex-col gap-y-2">
      {keys.map((warning) => (
        <Alert
          key={`${warning.marketplace}-${warning.type}`}
          variant={warning.type === "key_expiring" ? "warning" : "error"}
        >
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <span className="min-w-0">{keySentence(warning, t)}</span>
            {keyHref ? (
              <Button size="small" variant="secondary" asChild>
                <Link to={keyHref}>
                  <Key />
                  {t("mp.sync.keyButton")}
                </Link>
              </Button>
            ) : null}
          </div>
        </Alert>
      ))}
      {[...failures.entries()].map(([key, group]) => (
        <Alert key={key} variant="error">
          <div className="flex min-w-0 flex-col gap-y-1">
            <span>
              {t("marketplaceSync.warnings.failedGroup", {
                label: group[0].marketplace_label,
                reason: t(marketplaceErrorKey(group[0].error)),
              })}
            </span>
            <span className="text-ui-fg-subtle">
              {t("marketplaceSync.warnings.failedKinds", { kinds: kindsOf(group) })}
            </span>
            <SupportDetails
              text={group.map((w) => `${w.marketplace} / ${w.kind ?? "*"}: ${w.error ?? ""}`).join("\n")}
            />
          </div>
        </Alert>
      ))}
      {[...neverRan.entries()].map(([marketplace, group]) => (
        <Alert key={`${marketplace}-never-ran`} variant="warning">
          {t("marketplaceSync.warnings.neverRanGroup", {
            label: group[0].marketplace_label,
            kinds: kindsOf(group),
          })}
        </Alert>
      ))}
      {others.map((warning) => (
        <Alert key={`${warning.marketplace}-${warning.kind ?? "*"}-${warning.type}`} variant="warning">
          {keySentence(warning, t)}
        </Alert>
      ))}
    </div>
  )
}
