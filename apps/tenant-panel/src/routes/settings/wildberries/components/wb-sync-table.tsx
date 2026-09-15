import { useTranslation } from "react-i18next"

import type { WbStatusResponse } from "../../../../hooks/api/wb-status"

const NOT_SET = "—"

const formatDateTime = (value: string | null, locale: string): string => {
  if (!value) {
    return NOT_SET
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? NOT_SET : date.toLocaleString(locale)
}

const formatTime = (value: string | null, locale: string): string | null => {
  if (!value) {
    return null
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
}

/**
 * The newest import per kind (w01-wb-readonly-client).
 *
 * A kind that has never run shows "не запускался" rather than an empty cell,
 * because "no rows" and "never ran" are different facts and the owner needs to
 * tell them apart (rule 20a).
 *
 * A kind stopped by WB's rate limit is a THIRD fact (w03) and must not be
 * painted red: on a base token the limits are the normal operating condition,
 * so four red "с ошибкой" against kinds that were merely waiting read as a
 * broken integration. `rate_limited` is drawn in the neutral subtle tone and
 * names the window WB itself gave — "ждёт окна WB до 07:12" — and the rows it
 * managed to write before the limit stay in their own column, because a run
 * that wrote 1000 rows and then hit the limit is a partial success.
 */
export const WbSyncTable = ({ sync }: { sync: WbStatusResponse["sync"] }) => {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || "ru"

  return (
    <div className="overflow-x-auto">
      <table className="txt-compact-small w-full min-w-[640px] text-left">
        <thead className="text-ui-fg-subtle">
          <tr className="border-ui-border-base border-b">
            <th className="py-2 pr-4 font-normal">{t("wildberries.sync.kind")}</th>
            <th className="py-2 pr-4 font-normal">{t("wildberries.sync.status")}</th>
            <th className="py-2 pr-4 font-normal">{t("wildberries.sync.rows")}</th>
            <th className="py-2 pr-4 font-normal">{t("wildberries.sync.requests")}</th>
            <th className="py-2 font-normal">{t("wildberries.sync.finishedAt")}</th>
          </tr>
        </thead>
        <tbody>
          {sync.map((run) => (
            <tr key={run.kind} className="border-ui-border-base border-b last:border-b-0">
              <td className="py-2 pr-4">
                {t(`wildberries.kinds.${run.kind}`, { defaultValue: run.kind })}
              </td>
              <td
                className={`py-2 pr-4 ${
                  run.status === "failed"
                    ? "text-ui-fg-error"
                    : run.status === "rate_limited"
                      ? "text-ui-fg-subtle"
                      : ""
                }`}
              >
                {run.status
                  ? run.status === "rate_limited" && formatTime(run.retry_at, locale)
                    ? t("wildberries.statuses.rateLimitedUntil", {
                        time: formatTime(run.retry_at, locale),
                      })
                    : t(`wildberries.statuses.${run.status}`, { defaultValue: run.status })
                  : t("wildberries.sync.never")}
              </td>
              <td className="py-2 pr-4 tabular-nums">{run.rows ?? NOT_SET}</td>
              <td className="py-2 pr-4 tabular-nums">{run.requests ?? NOT_SET}</td>
              <td className="py-2">{formatDateTime(run.finished_at, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
