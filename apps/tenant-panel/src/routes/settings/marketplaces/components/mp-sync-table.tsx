import { Badge } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import type { MarketplaceCard } from "../../../../hooks/api/marketplaces"
import {
  SupportDetails,
  marketplaceErrorKey,
} from "../../../../components/common/support-details"

const NOT_SET = "—"

const formatDateTime = (value: string | null, locale: string): string => {
  if (!value) {
    return NOT_SET
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? NOT_SET : date.toLocaleString(locale)
}

/**
 * The newest import per kind, for ONE marketplace (w12-marketplace-core,
 * generalised from `wb-sync-table`).
 *
 * A kind that has never run shows «не запускалось» rather than an empty cell,
 * because "no rows" and "never ran" are different facts and the owner has to
 * tell them apart (rule 20a). A run that came from recorded fixtures is
 * labelled, so a fixture run is never read as a live one.
 */
export const MpSyncTable = ({ sync }: { sync: MarketplaceCard["sync"] }) => {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || "ru"

  return (
    <div className="overflow-x-auto">
      <table className="txt-compact-small w-full min-w-[720px] text-left">
        <thead className="text-ui-fg-subtle">
          <tr className="border-ui-border-base border-b">
            <th className="py-2 pr-4 font-normal">{t("marketplaces.sync.kind")}</th>
            <th className="py-2 pr-4 font-normal">{t("marketplaces.sync.status")}</th>
            <th className="py-2 pr-4 font-normal">{t("marketplaces.sync.rows")}</th>
            <th className="py-2 pr-4 font-normal">{t("marketplaces.sync.requests")}</th>
            <th className="py-2 pr-4 font-normal">{t("marketplaces.sync.finishedAt")}</th>
            <th className="py-2 font-normal">{t("marketplaces.sync.error")}</th>
          </tr>
        </thead>
        <tbody>
          {sync.map((run) => (
            <tr key={run.kind} className="border-ui-border-base border-b last:border-b-0">
              <td className="py-2 pr-4">
                {t(`marketplaces.kinds.${run.kind}`, { defaultValue: run.kind })}
                {run.is_fixture ? (
                  <Badge className="ml-2" color="orange" size="2xsmall">
                    {t("marketplaces.sync.fixture")}
                  </Badge>
                ) : null}
              </td>
              <td className={`py-2 pr-4 ${run.status === "failed" ? "text-ui-fg-error" : ""}`}>
                {run.status
                  ? t(`marketplaces.statuses.${run.status}`, { defaultValue: run.status })
                  : t("marketplaces.sync.never")}
              </td>
              <td className="py-2 pr-4 tabular-nums">{run.rows ?? NOT_SET}</td>
              <td className="py-2 pr-4 tabular-nums">{run.requests ?? NOT_SET}</td>
              <td className="py-2 pr-4">{formatDateTime(run.finished_at, locale)}</td>
              <td className="text-ui-fg-error py-2">
                {run.error ? (
                  <div className="flex min-w-[200px] max-w-[360px] flex-col whitespace-normal">
                    <span>{t(marketplaceErrorKey(run.error))}</span>
                    <SupportDetails text={run.error} />
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
