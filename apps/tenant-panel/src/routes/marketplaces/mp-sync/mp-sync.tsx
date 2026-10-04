import { Key } from "@medusajs/icons"
import { Alert, Button, Text, toast } from "@medusajs/ui"
import { createColumnHelper } from "@tanstack/react-table"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { SupportDetails, marketplaceErrorKey } from "../../../components/common/support-details"
import { _DataTable } from "../../../components/table/data-table/data-table"
import { StatusCell } from "../../../components/table/table-cells/common/status-cell"
import { useDataTable } from "../../../hooks/use-data-table"
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
import { DateTimeCell, UnitsCell } from "../common/mp-cells"
import { MpPage } from "../common/mp-page"

/**
 * «Wildberries → Обновление» (mp-section-design; the owner's word for the
 * sync, per the glossary, was «Обмен», Ivan renamed it «Обновление» on
 * 2026-10-05): a row per kind of data, when it last came, how often it comes,
 * when it comes next and what went wrong. One marketplace, so the key line
 * sits under the heading and «Обновить сейчас» is the primary action.
 *
 * The rows are the shop's own `_DataTable` without search and pages, so on a
 * phone they fold into cards the way every other list of the panel does.
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

  const columns = useColumns(sync?.now ?? new Date().toISOString())
  const { table } = useDataTable({
    data: sync?.marketplace.kinds ?? [],
    columns,
    count: sync?.marketplace.kinds.length ?? 0,
    // The table primitive reads its pagination state even when no pages are
    // drawn; one page of 50 holds every kind a marketplace has.
    enablePagination: true,
    pageSize: 50,
    getRowId: (row) => row.kind,
  })

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

      {!isPending && entry && entry.kinds.length === 0 ? (
        <div className="px-6 py-6">
          <Alert variant="info">{t("mp.sync.nothingScheduled", { marketplace: label })}</Alert>
        </div>
      ) : (
        <_DataTable
          table={table}
          columns={columns}
          count={entry?.kinds.length ?? 0}
          pageSize={50}
          isLoading={isPending}
          noRecords={{ title: t("mp.sync.title"), message: t("mp.sync.nothingScheduled", { marketplace: label }) }}
        />
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

const columnHelper = createColumnHelper<MarketplaceSyncKind>()

const useColumns = (now: string) => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()

  return useMemo(
    () => [
      columnHelper.accessor("kind", {
        header: () => <span>{t("mp.sync.columns.kind")}</span>,
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap">{t(`marketplaces.kinds.${getValue()}`, { defaultValue: getValue() })}</span>
        ),
        meta: { phoneTop: true },
      }),
      columnHelper.accessor("status", {
        header: () => <span>{t("mp.sync.columns.state")}</span>,
        cell: ({ getValue }) =>
          getValue() === null ? (
            <StatusCell color="grey">{t("marketplaceSync.neverRan")}</StatusCell>
          ) : (
            <StatusCell color={STATE_COLOR[getValue() as string] ?? "grey"}>
              {t(`marketplaces.statuses.${getValue()}`, { defaultValue: getValue() ?? "" })}
            </StatusCell>
          ),
        meta: { phoneTop: "end" },
      }),
      columnHelper.accessor("last_success_at", {
        header: () => <span>{t("mp.sync.columns.lastSuccess")}</span>,
        cell: ({ getValue }) =>
          getValue() ? (
            <DateTimeCell date={getValue()} />
          ) : (
            <span className="text-ui-fg-muted">{t("marketplaceSync.neverSucceeded")}</span>
          ),
      }),
      columnHelper.accessor("rows", {
        header: () => <span>{t("mp.sync.columns.rows")}</span>,
        cell: ({ getValue }) => <UnitsCell value={getValue()} />,
      }),
      columnHelper.accessor("interval_ms", {
        header: () => <span>{t("mp.sync.columns.every")}</span>,
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap">
            {getValue()
              ? t("marketplaceSync.everyMinutes", { count: Math.round((getValue() as number) / 60_000) })
              : t("marketplaceSync.notScheduled")}
          </span>
        ),
      }),
      columnHelper.accessor("next_at", {
        header: () => <span>{t("mp.sync.columns.next")}</span>,
        cell: ({ row }) => {
          const kind = row.original
          if (kind.due_reason === "locked") {
            return <span className="text-ui-fg-subtle">{t("marketplaceSync.running")}</span>
          }
          if (kind.due) {
            return <span className="text-ui-fg-interactive">{t("marketplaceSync.dueNow")}</span>
          }
          if (!kind.next_at) {
            return <span className="text-ui-fg-muted">—</span>
          }
          const minutes = Math.round((new Date(kind.next_at).getTime() - new Date(now).getTime()) / 60_000)
          const wait = Number.isNaN(minutes)
            ? "—"
            : minutes <= 0
              ? t("marketplaceSync.dueNow")
              : minutes < 60
                ? t("marketplaceSync.inMinutes", { count: minutes })
                : t("marketplaceSync.inHours", { count: Math.round(minutes / 60) })
          return (
            <div className="flex flex-col">
              <span className="whitespace-nowrap">{wait}</span>
              {kind.retry_at && kind.due_reason === "waiting" ? (
                <span className="text-ui-fg-subtle txt-compact-xsmall">
                  {t("marketplaceSync.waitingForMarketplace", {
                    at: getFullDate({ date: kind.retry_at, includeTime: true }),
                  })}
                </span>
              ) : null}
            </div>
          )
        },
      }),
      columnHelper.accessor("last_failure_error", {
        header: () => <span>{t("mp.sync.columns.failure")}</span>,
        cell: ({ row }) => {
          const kind = row.original
          if (!kind.last_failure_error) {
            return <span className="text-ui-fg-muted">{t("marketplaceSync.noFailures")}</span>
          }
          return (
            <div className="flex max-w-[360px] flex-col gap-y-0.5 whitespace-normal">
              <span className="text-ui-fg-error">{t(marketplaceErrorKey(kind.last_failure_error))}</span>
              {kind.last_failure_at ? (
                <span className="text-ui-fg-subtle txt-compact-xsmall">
                  {getFullDate({ date: kind.last_failure_at, includeTime: true })}
                </span>
              ) : null}
              <SupportDetails text={kind.last_failure_error} />
            </div>
          )
        },
        meta: { phoneWide: true },
      }),
    ],
    [t, now, getFullDate]
  )
}
