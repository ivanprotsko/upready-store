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
  useMpSyncNow,
  type MarketplaceId,
} from "../../../hooks/api/marketplace-section"
import type { MarketplaceSyncKind, SyncNowResult } from "../../../hooks/api/marketplace-sync"
import { DateTimeCell, UnitsCell } from "../common/mp-cells"
import { MpPage } from "../common/mp-page"
import { useRouteMarketplace } from "../common/use-route-marketplace"
import { useSyncLabels } from "./components/kind-label"
import { MpSyncWarnings } from "./components/mp-sync-warnings"

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
 *
 * Live path (task-07 of ask-20261005-023327-f02b): the rows come from
 * `GET /tenants/marketplaces/:marketplace/sync`, which reads nothing from the
 * marketplace, and «Обновить сейчас» is `POST` on the same address, the one
 * mutation of the screen. Started kinds show «идёт» at once and the screen
 * looks again every ten seconds while any kind is running.
 *
 * The core's own `projection` kind is left out of the table: it recomputes
 * the shared layer from what already came in, sends no request to the
 * marketplace, and the owner has no data called that. Its failure still
 * reaches the warnings above the table, so leaving out the row hides nothing.
 */

const STATE_COLOR: Record<string, "green" | "red" | "orange" | "grey"> = {
  succeeded: "green",
  failed: "red",
  auth_failed: "red",
  rate_limited: "orange",
  running: "grey",
}

/** The core's own kind, not data of the marketplace (see the doc comment above). */
const CORE_KINDS = new Set(["projection"])

/** While any kind is running, how often the screen looks again. */
const RUNNING_REFETCH_MS = 10_000

export const MpSync = ({ marketplace: forced }: { marketplace?: MarketplaceId }) => {
  const fromRoute = useRouteMarketplace()
  const marketplace = forced ?? fromRoute
  const { t } = useTranslation()
  const { getFullDate } = useDate()
  const { kindLabel } = useSyncLabels()
  const { sync, isPending, isError, error } = useMpSync(marketplace, {
    refetchInterval: (query) =>
      query.state.data?.marketplace.kinds.some((kind) => kind.status === "running") ? RUNNING_REFETCH_MS : false,
  })
  const { mutateAsync: syncNow, isPending: isSyncing } = useMpSyncNow(marketplace)

  const entry = sync?.marketplace
  const hasKey = Boolean(entry?.connection.key.set)
  const kinds = useMemo(
    () => (entry && hasKey ? entry.kinds.filter((kind) => !CORE_KINDS.has(kind.kind)) : []),
    [entry, hasKey]
  )

  const columns = useColumns(sync?.now ?? new Date().toISOString())
  const { table } = useDataTable({
    data: kinds,
    columns,
    count: kinds.length,
    // The table primitive reads its pagination state even when no pages are
    // drawn; one page of 50 holds every kind a marketplace has, and
    // `pagination={false}` below keeps the footer off.
    enablePagination: true,
    pageSize: 50,
    getRowId: (row) => row.kind,
  })

  if (isError) {
    throw error
  }

  const label = MARKETPLACE_LABEL[marketplace]
  const slug = slugOf(marketplace)
  const keyHref = `/settings/integrations/${slug}`

  /** «Карточки товаров», or «Wildberries (ключ не сохранён)» for a whole marketplace. */
  const describe = (result: SyncNowResult) => {
    const what = result.kind === "*" ? label : kindLabel(result.kind)
    return result.outcome === "started"
      ? what
      : `${what} (${t(`marketplaceSync.syncNow.reasons.${result.reason}`, {
          defaultValue: t("mp.sync.otherReason"),
        })})`
  }

  const run = async () => {
    if (MP_FIXTURES) {
      toast.success(t("marketplaceSync.syncNow.toastTitle", { count: 10 }), {
        description: t("mp.sync.toastFixture", { marketplace: label }),
      })
      return
    }
    try {
      const { results } = await syncNow()
      // The core's own kind starts too, but the owner was never shown it, so
      // the toast counts what the table shows.
      const shown = results.filter((result) => !CORE_KINDS.has(result.kind))
      const started = shown.filter((result) => result.outcome === "started")
      const skipped = shown.filter((result) => result.outcome === "skipped")

      toast.success(
        started.length
          ? t("marketplaceSync.syncNow.toastTitle", { count: started.length })
          : t("marketplaceSync.syncNow.toastTitleNone"),
        {
          description: [
            started.length
              ? t("marketplaceSync.syncNow.toastStarted", { list: started.map(describe).join(", ") })
              : null,
            skipped.length
              ? t("marketplaceSync.syncNow.toastSkipped", { list: skipped.map(describe).join(", ") })
              : null,
          ]
            .filter((line): line is string => Boolean(line))
            .join("\n"),
        }
      )
    } catch (failure) {
      // A run already going answers 409 with the backend's own sentence
      // (`type: "sync_in_progress"`), which `FetchError.message` carries.
      toast.error(failure instanceof Error ? failure.message : String(failure))
    }
  }

  const keyLine = entry
    ? !hasKey
      ? t("mp.sync.noKey", { marketplace: label })
      : !entry.credentials.expires_at
        ? t("mp.sync.keyLineNoExpiry", {
            marketplace: label,
            last4: entry.connection.key.last4 ?? "????",
          })
        : t(entry.credentials.expired ? "mp.sync.keyLineExpired" : "mp.sync.keyLine", {
            marketplace: label,
            last4: entry.connection.key.last4 ?? "????",
            until: getFullDate({ date: entry.credentials.expires_at }),
          })
    : null

  return (
    <MpPage
      title={t("mp.sync.title")}
      subtitle={keyLine}
      actions={
        <>
          <Button size="small" variant="secondary" asChild>
            <Link to={keyHref}>
              <Key />
              {t("mp.sync.keyButton")}
            </Link>
          </Button>
          <Button size="small" variant="primary" onClick={run} isLoading={isSyncing} disabled={!hasKey}>
            {t("marketplaceSync.syncNow.button")}
          </Button>
        </>
      }
    >
      {sync?.warnings.length ? (
        <div className="px-6 py-4">
          <MpSyncWarnings warnings={sync.warnings} keyHref={keyHref} />
        </div>
      ) : null}

      {!isPending && entry && hasKey && kinds.length === 0 ? (
        <div className="px-6 py-6">
          <Alert variant="info">{t("mp.sync.nothingScheduled", { marketplace: label })}</Alert>
        </div>
      ) : (
        <_DataTable
          table={table}
          columns={columns}
          count={kinds.length}
          pageSize={kinds.length || 10}
          pagination={false}
          isLoading={isPending}
          noRecords={{
            title: t("mp.sync.empty.noKeyTitle"),
            message: t("mp.sync.empty.noKeyMessage", { marketplace: label }),
          }}
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
  const { kindLabel, statusLabel } = useSyncLabels()

  return useMemo(
    () => [
      columnHelper.accessor("kind", {
        header: () => <span>{t("mp.sync.columns.kind")}</span>,
        cell: ({ getValue }) => <span className="whitespace-nowrap">{kindLabel(getValue())}</span>,
        meta: { phoneTop: true },
      }),
      columnHelper.accessor("status", {
        header: () => <span>{t("mp.sync.columns.state")}</span>,
        cell: ({ getValue }) => {
          const status = getValue()
          return status === null ? (
            <StatusCell color="grey">{t("marketplaceSync.neverRan")}</StatusCell>
          ) : (
            <StatusCell color={STATE_COLOR[status] ?? "grey"}>{statusLabel(status)}</StatusCell>
          )
        },
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
          if (kind.status === "running" || kind.due_reason === "locked") {
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
            <div className="flex max-w-[360px] flex-col gap-y-0.5 whitespace-normal max-md:max-w-none">
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
    [t, now, getFullDate, kindLabel, statusLabel]
  )
}
