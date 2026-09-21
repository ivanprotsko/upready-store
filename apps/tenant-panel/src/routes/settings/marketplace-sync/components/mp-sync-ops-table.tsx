import { useTranslation } from "react-i18next"

import {
  SupportDetails,
  marketplaceErrorKey,
} from "../../../../components/common/support-details"
import type { MarketplaceSyncEntry } from "../../../../hooks/api/marketplace-sync"
import { MpSyncStateCell } from "./mp-sync-state-cell"

const NOT_SET = "—"

const formatDateTime = (value: string | null, locale: string): string => {
  if (!value) {
    return NOT_SET
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? NOT_SET : date.toLocaleString(locale)
}

/**
 * «Через 7 мин», «через 2 ч», counted from the SERVER's clock and not the
 * browser's: a laptop whose clock drifts would otherwise show a schedule that
 * disagrees with the database it is describing.
 */
type Wait = { key: string; minutes: number } | null

const waitUntil = (value: string | null, now: string): Wait => {
  if (!value) {
    return null
  }
  const delta = new Date(value).getTime() - new Date(now).getTime()
  if (Number.isNaN(delta)) {
    return null
  }
  if (delta <= 0) {
    return { key: "marketplaceSync.dueNow", minutes: 0 }
  }
  const minutes = Math.round(delta / 60_000)
  return minutes < 60
    ? { key: "marketplaceSync.inMinutes", minutes }
    : { key: "marketplaceSync.inHours", minutes: Math.round(minutes / 60) }
}

/**
 * One marketplace's schedule: a row per kind with the last success, what the
 * newest run cost, when the next one is due and the text of the last failure
 * in full (w16-mp-scheduler-ops, spec 2.6).
 *
 * The failure column carries `last_failure_error` and not only the newest
 * run's: an import that fails every other hour is broken, and a table showing
 * only the newest run would let the good half hide the bad one.
 */
export const MpSyncOpsTable = ({ entry, now }: { entry: MarketplaceSyncEntry; now: string }) => {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || "ru"

  return (
    <div className="overflow-x-auto">
      <table className="txt-compact-small w-full min-w-[980px] text-left">
        <thead className="text-ui-fg-subtle">
          <tr className="border-ui-border-base border-b">
            <th className="py-2 pr-4 font-normal">{t("marketplaces.sync.kind")}</th>
            <th className="py-2 pr-4 font-normal">{t("marketplaceSync.state")}</th>
            <th className="py-2 pr-4 font-normal">{t("marketplaceSync.lastSuccess")}</th>
            <th className="py-2 pr-4 font-normal">{t("marketplaces.sync.rows")}</th>
            <th className="py-2 pr-4 font-normal">{t("marketplaces.sync.requests")}</th>
            <th className="py-2 pr-4 font-normal">{t("marketplaceSync.every")}</th>
            <th className="py-2 pr-4 font-normal">{t("marketplaceSync.nextRun")}</th>
            <th className="py-2 font-normal">{t("marketplaceSync.lastFailure")}</th>
          </tr>
        </thead>
        <tbody>
          {entry.kinds.map((row) => (
            <tr key={row.kind} className="border-ui-border-base border-b last:border-b-0">
              <td className="py-2 pr-4">
                {t(`marketplaces.kinds.${row.kind}`, { defaultValue: row.kind })}
              </td>
              <td className="py-2 pr-4">
                <MpSyncStateCell row={row} />
              </td>
              <td className="py-2 pr-4">
                {row.last_success_at ? (
                  formatDateTime(row.last_success_at, locale)
                ) : (
                  <span className="text-ui-fg-muted">{t("marketplaceSync.neverSucceeded")}</span>
                )}
              </td>
              <td className="py-2 pr-4 tabular-nums">{row.rows ?? NOT_SET}</td>
              <td className="py-2 pr-4 tabular-nums">{row.requests ?? NOT_SET}</td>
              <td className="py-2 pr-4">
                {row.interval_ms
                  ? t("marketplaceSync.everyMinutes", {
                      count: Math.round(row.interval_ms / 60_000),
                    })
                  : t("marketplaceSync.notScheduled")}
              </td>
              <td className="py-2 pr-4">
                {row.due_reason === "locked" ? (
                  <span className="text-ui-fg-subtle">{t("marketplaceSync.running")}</span>
                ) : row.due ? (
                  <span className="text-ui-fg-interactive">{t("marketplaceSync.dueNow")}</span>
                ) : (
                  <>
                    {(() => {
                      const wait = waitUntil(row.next_at, now)
                      return wait ? t(wait.key, { count: wait.minutes }) : NOT_SET
                    })()}
                    {row.retry_at && row.due_reason === "waiting" ? (
                      <div className="text-ui-fg-subtle txt-compact-xsmall">
                        {t("marketplaceSync.waitingForMarketplace", {
                          at: formatDateTime(row.retry_at, locale),
                        })}
                      </div>
                    ) : null}
                  </>
                )}
              </td>
              <td className="py-2">
                {row.last_failure_error ? (
                  <div className="text-ui-fg-error max-w-[420px] whitespace-pre-wrap break-words">
                    {t(marketplaceErrorKey(row.last_failure_error))}
                    <div className="text-ui-fg-subtle txt-compact-xsmall">
                      {formatDateTime(row.last_failure_at, locale)}
                    </div>
                    <SupportDetails text={row.last_failure_error} />
                  </div>
                ) : (
                  <span className="text-ui-fg-muted">{t("marketplaceSync.noFailures")}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
