import { Key } from "@medusajs/icons"
import { Alert, Button, Table, Text, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { SupportDetails, marketplaceErrorKey } from "../../../components/common/support-details"
import { StatusCell } from "../../../components/table/table-cells/common/status-cell"
import { useDate } from "../../../hooks/use-date"
import {
  MARKETPLACE_LABEL,
  MP_FIXTURES,
  slugOf,
  useMpSync,
  type MarketplaceId,
} from "../../../hooks/api/marketplace-section"
import { useSyncMarketplacesNow, type MarketplaceSyncKind } from "../../../hooks/api/marketplace-sync"
import { MpSyncWarnings } from "../../settings/marketplace-sync/components/mp-sync-warnings"
import { MpPage } from "../common/mp-page"

/**
 * «Wildberries → Обновление» (mp-section-design; the owner's word for the
 * sync, per the glossary, was «Обмен», Ivan renamed it «Обновление» on
 * 2026-10-05): a row per kind of data, when it last came, how often it comes,
 * when it comes next and what went wrong. One marketplace, so the key line
 * sits under the heading and «Обновить сейчас» is the primary action.
 *
 * What changed against the w16 screen: the «← к подключению» link became a
 * button to the key, the two sentences about the schedule became one under
 * the heading, the state is the shop's coloured dot, the requests column is
 * gone (the owner does not count requests), and the raw answer of the
 * marketplace stays closed under «Подробности для поддержки» (o21, P3).
 */

const STATE_COLOR: Record<string, "green" | "red" | "orange" | "grey"> = {
  succeeded: "green",
  failed: "red",
  rate_limited: "orange",
  running: "grey",
}

export const MpSync = ({ marketplace = "wb" }: { marketplace?: MarketplaceId }) => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()
  const { sync, isPending, isError, error } = useMpSync(marketplace)
  const { mutateAsync: syncNow, isPending: isSyncing } = useSyncMarketplacesNow()

  if (isError) {
    throw error
  }

  const label = MARKETPLACE_LABEL[marketplace]
  const slug = slugOf(marketplace)
  const entry = sync?.marketplace

  const run = async () => {
    if (MP_FIXTURES) {
      toast.success(t("marketplaceSync.syncNow.toastTitle", { count: 10 }), {
        description: t("mp.sync.toastFixture", { marketplace: label }),
      })
      return
    }
    try {
      const { results } = await syncNow()
      const started = results.filter((r) => r.outcome === "started").length
      toast.success(
        started ? t("marketplaceSync.syncNow.toastTitle", { count: started }) : t("marketplaceSync.syncNow.toastTitleNone")
      )
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : String(failure))
    }
  }

  const keyLine = entry
    ? entry.connection.key.set
      ? t("mp.sync.keyLine", {
          marketplace: label,
          last4: entry.connection.key.last4 ?? "????",
          until: entry.credentials.expires_at
            ? getFullDate({ date: entry.credentials.expires_at })
            : t("marketplaceSync.noExpiry"),
        })
      : t("mp.sync.noKey", { marketplace: label })
    : null

  return (
    <MpPage
      title={t("mp.sync.title")}
      subtitle={keyLine}
      actions={
        <>
          <Button size="small" variant="secondary" asChild>
            <Link to={`/settings/integrations/${slug}`}>
              <Key />
              {t("mp.sync.keyButton")}
            </Link>
          </Button>
          <Button size="small" variant="primary" onClick={run} isLoading={isSyncing} disabled={!entry?.connection.key.set}>
            {t("marketplaceSync.syncNow.button")}
          </Button>
        </>
      }
    >
      {sync?.warnings.length ? (
        <div className="px-6 py-4">
          <MpSyncWarnings warnings={sync.warnings} />
        </div>
      ) : null}

      {isPending || !entry ? (
        <div className="px-6 py-6">
          <Text size="small" className="text-ui-fg-subtle">
            {t("general.loading")}
          </Text>
        </div>
      ) : entry.kinds.length === 0 ? (
        <div className="px-6 py-6">
          <Alert variant="info">{t("mp.sync.nothingScheduled", { marketplace: label })}</Alert>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>{t("mp.sync.columns.kind")}</Table.HeaderCell>
                <Table.HeaderCell>{t("mp.sync.columns.state")}</Table.HeaderCell>
                <Table.HeaderCell>{t("mp.sync.columns.lastSuccess")}</Table.HeaderCell>
                <Table.HeaderCell className="text-right">{t("mp.sync.columns.rows")}</Table.HeaderCell>
                <Table.HeaderCell>{t("mp.sync.columns.every")}</Table.HeaderCell>
                <Table.HeaderCell>{t("mp.sync.columns.next")}</Table.HeaderCell>
                <Table.HeaderCell>{t("mp.sync.columns.failure")}</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {entry.kinds.map((row) => (
                <KindRow key={row.kind} row={row} now={sync.now} />
              ))}
            </Table.Body>
          </Table>
        </div>
      )}

      <div className="px-6 py-3">
        <Text size="xsmall" className="text-ui-fg-muted">
          {t("mp.sync.footer", { days: sync?.schedule.expiry_warning_days ?? 14 })}{" "}
          <Link to={`/settings/marketplaces/${slug}`} className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover">
            {t("mp.sync.rightsLink")}
          </Link>
        </Text>
      </div>
    </MpPage>
  )
}

const KindRow = ({ row, now }: { row: MarketplaceSyncKind; now: string }) => {
  const { t, i18n } = useTranslation()
  const { getFullDate } = useDate()
  const locale = i18n.language || "ru"

  const wait = (() => {
    if (row.due_reason === "locked") {
      return t("marketplaceSync.running")
    }
    if (row.due) {
      return t("marketplaceSync.dueNow")
    }
    if (!row.next_at) {
      return "—"
    }
    const minutes = Math.round((new Date(row.next_at).getTime() - new Date(now).getTime()) / 60_000)
    if (Number.isNaN(minutes)) {
      return "—"
    }
    if (minutes <= 0) {
      return t("marketplaceSync.dueNow")
    }
    return minutes < 60
      ? t("marketplaceSync.inMinutes", { count: minutes })
      : t("marketplaceSync.inHours", { count: Math.round(minutes / 60) })
  })()

  return (
    <Table.Row>
      <Table.Cell>
        <span className="whitespace-nowrap">{t(`marketplaces.kinds.${row.kind}`, { defaultValue: row.kind })}</span>
      </Table.Cell>
      <Table.Cell>
        {row.status === null ? (
          <StatusCell color="grey">{t("marketplaceSync.neverRan")}</StatusCell>
        ) : (
          <StatusCell color={STATE_COLOR[row.status] ?? "grey"}>
            {t(`marketplaces.statuses.${row.status}`, { defaultValue: row.status })}
          </StatusCell>
        )}
      </Table.Cell>
      <Table.Cell>
        {row.last_success_at ? (
          <span className="whitespace-nowrap">{getFullDate({ date: row.last_success_at, includeTime: true })}</span>
        ) : (
          <span className="text-ui-fg-muted">{t("marketplaceSync.neverSucceeded")}</span>
        )}
      </Table.Cell>
      <Table.Cell className="text-right tabular-nums">
        {row.rows === null ? "—" : new Intl.NumberFormat(locale).format(row.rows)}
      </Table.Cell>
      <Table.Cell>
        <span className="whitespace-nowrap">
          {row.interval_ms
            ? t("marketplaceSync.everyMinutes", { count: Math.round(row.interval_ms / 60_000) })
            : t("marketplaceSync.notScheduled")}
        </span>
      </Table.Cell>
      <Table.Cell>
        <span className="whitespace-nowrap">{wait}</span>
        {row.retry_at && row.due_reason === "waiting" ? (
          <div className="text-ui-fg-subtle txt-compact-xsmall">
            {t("marketplaceSync.waitingForMarketplace", { at: getFullDate({ date: row.retry_at, includeTime: true }) })}
          </div>
        ) : null}
      </Table.Cell>
      <Table.Cell>
        {row.last_failure_error ? (
          <div className="flex max-w-[360px] flex-col gap-y-0.5">
            <span className="text-ui-fg-error">{t(marketplaceErrorKey(row.last_failure_error))}</span>
            {row.last_failure_at ? (
              <span className="text-ui-fg-subtle txt-compact-xsmall">
                {getFullDate({ date: row.last_failure_at, includeTime: true })}
              </span>
            ) : null}
            <SupportDetails text={row.last_failure_error} />
          </div>
        ) : (
          <span className="text-ui-fg-muted">{t("marketplaceSync.noFailures")}</span>
        )}
      </Table.Cell>
    </Table.Row>
  )
}
