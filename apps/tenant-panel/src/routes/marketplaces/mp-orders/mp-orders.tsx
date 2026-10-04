import { ArrowDownTray } from "@medusajs/icons"
import { Alert, Button, Text, toast } from "@medusajs/ui"
import { keepPreviousData } from "@tanstack/react-query"
import { createColumnHelper } from "@tanstack/react-table"
import { useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Link, useLocation } from "react-router-dom"

import { SupportDetails, marketplaceErrorKey } from "../../../components/common/support-details"
import { Filter } from "../../../components/table/data-table"
import { _DataTable } from "../../../components/table/data-table/data-table"
import { PlaceholderCell } from "../../../components/table/table-cells/common/placeholder-cell"
import { StatusCell } from "../../../components/table/table-cells/common/status-cell"
import { useDataTable } from "../../../hooks/use-data-table"
import type { FeedConnection, FeedFacet, FeedOrder } from "../../../hooks/api/marketplace-orders"
import {
  MARKETPLACE_LABEL,
  MP_FIXTURES,
  MP_ORDERS_EXPORT_LIMIT,
  mpOrdersExportPath,
  slugOf,
  useMpOrders,
  type MarketplaceId,
} from "../../../hooks/api/marketplace-section"
import { sdk } from "../../../lib/client"
import { DateTimeCell, MoneyCell } from "../common/mp-cells"
import { MpPage } from "../common/mp-page"
import { useMpListQuery } from "../common/use-mp-list-query"
import { ORDER_STATUS_COLOR, rawStatusOf } from "./order-status"

/**
 * «Wildberries → Заказы» (mp-section-design): the marketplace's orders as the
 * import stored them in `mp_order`, in the shop's own orders table: the same
 * `_DataTable`, status as a coloured dot, date with time, sum on the right,
 * a row opens the order. READ ONLY as w15 decided (Ivan, 2026-09-16 02:46):
 * nothing here changes an order on the marketplace.
 *
 * What changed against the w15 desk: the shop's own orders are not mixed in
 * (they live under «Продажи → Заказы»; this section is one marketplace), no
 * period is applied unless the owner picks a date, the badge-chip filters
 * became the shop's filter row, «Показать ещё» became pages, and the
 * connection banner shows only when there is something to say.
 *
 * The data is `GET /tenants/marketplaces/:marketplace/orders` (task-04); the
 * CSV is the same query on `…/orders/export`, so the file is the table.
 */

const PAGE_SIZE = 20
const FILTER_KEYS = ["status", "scheme", "ordered_at"] as const

const BANNER: Record<string, "info" | "warning" | "error"> = {
  missing: "info",
  never_run: "warning",
  failed: "error",
  rate_limited: "warning",
  fixture: "warning",
}

/** Why the list is empty, by what the backend says about the connection (rule 20a). */
const EMPTY_REASON: Record<string, string> = {
  missing: "missing",
  never_run: "never_run",
  failed: "failed",
  rate_limited: "rate_limited",
}

export const MpOrders = ({ marketplace = "wb" }: { marketplace?: MarketplaceId }) => {
  const { t } = useTranslation()
  const { search } = useLocation()
  const { params, raw, dates } = useMpListQuery([...FILTER_KEYS], PAGE_SIZE)
  const query = { ...params, ordered_at: dates.ordered_at }

  const { orders, count, facets, connection, undated, isLoading, isError, error } = useMpOrders(
    marketplace,
    query,
    { placeholderData: keepPreviousData }
  )

  const columns = useColumns()
  const filters = useFilters(facets)
  const { table } = useDataTable({
    data: orders ?? [],
    columns,
    count: count ?? 0,
    enablePagination: true,
    pageSize: PAGE_SIZE,
    getRowId: (row) => row.id,
  })

  /**
   * The SAME query string the table was built from, so the file IS the table.
   * A string, so the callback below changes only when the query does.
   */
  const exportPath = mpOrdersExportPath(marketplace, query)
  const rows = count ?? 0

  /**
   * The export is fetched through the SDK rather than opened as a link,
   * because the panel authenticates with a bearer token the browser would not
   * attach to a plain navigation, and `accept: text/csv` is what makes the SDK
   * hand back the raw `Response` instead of parsing the body as JSON
   * (`@medusajs/js-sdk` 2.19, the lesson the w15 desk recorded).
   */
  const download = useCallback(async () => {
    const inFile = Math.min(rows, MP_ORDERS_EXPORT_LIMIT)
    if (MP_FIXTURES) {
      toast.success(t("mp.orders.toasts.exported", { count: inFile }))
      return
    }
    try {
      const response = await sdk.client.fetch<Response>(exportPath, {
        headers: { accept: "text/csv" },
      })
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `${slugOf(marketplace)}-orders-${new Date().toISOString().slice(0, 10)}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
      if (rows > MP_ORDERS_EXPORT_LIMIT) {
        toast.warning(t("mp.orders.toasts.truncated", { count: rows, limit: MP_ORDERS_EXPORT_LIMIT }))
      } else {
        toast.success(t("mp.orders.toasts.exported", { count: inFile }))
      }
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : t("mp.orders.toasts.exportFailed"))
    }
  }, [exportPath, marketplace, rows, t])

  // After every hook: a throw here hands the failure to the route's own
  // ErrorBoundary, and a hook below it would change the hook order of the
  // render that throws.
  if (isError) {
    throw error
  }

  const label = MARKETPLACE_LABEL[marketplace]
  const slug = slugOf(marketplace)
  const reason = (connection?.notice && EMPTY_REASON[connection.notice]) || "default"

  return (
    <MpPage
      title={t("mp.orders.title")}
      subtitle={subtitleOf(connection, label, t)}
      actions={
        <Button size="small" variant="secondary" onClick={download} disabled={!rows}>
          <ArrowDownTray />
          {t("mp.orders.export")}
        </Button>
      }
    >
      {connection?.notice ? (
        <div className="px-6 py-4">
          <Alert variant={BANNER[connection.notice] ?? "warning"}>
            <div className="flex flex-col gap-y-1">
              <Text size="small">
                {t(`marketplaceOrders.connection.${connection.notice}`, {
                  marketplace: label,
                  error: t(marketplaceErrorKey(connection.last_run?.error)),
                })}
              </Text>
              <NoticeLink notice={connection.notice} slug={slug} />
              {connection.notice === "failed" && connection.last_run?.error ? (
                <SupportDetails text={connection.last_run.error} />
              ) : null}
            </div>
          </Alert>
        </div>
      ) : null}
      {undated ? (
        <div className="px-6 py-3">
          <Text size="small" className="text-ui-fg-subtle" data-testid="orders-undated">
            {dates.ordered_at
              ? t("mp.orders.undated.outOfFilter", { count: undated })
              : t("mp.orders.undated.inList", { count: undated })}
          </Text>
        </div>
      ) : null}
      <_DataTable
        table={table}
        columns={columns}
        count={rows}
        pageSize={PAGE_SIZE}
        filters={filters}
        search
        pagination
        isLoading={isLoading}
        queryObject={raw}
        // The list's own address rides along, so «назад» on the card returns
        // to the same filters and the same page.
        navigateTo={(row) => `/marketplaces/${slug}/orders/${row.original.id}${search}`}
        orderBy={[
          { key: "ordered_at", label: t("mp.fields.orderedAt") },
          { key: "total", label: t("fields.total") },
          { key: "number", label: t("mp.fields.number") },
        ]}
        noRecords={{
          title: t(`mp.orders.empty.${reason}.title`, { marketplace: label }),
          message: t(`mp.orders.empty.${reason}.message`, { marketplace: label }),
        }}
      />
    </MpPage>
  )
}

const subtitleOf = (
  connection: FeedConnection | undefined,
  label: string,
  t: ReturnType<typeof useTranslation>["t"]
) => {
  if (!connection) {
    return null
  }
  // A shop that removed its key still has the orders it loaded: the count wins.
  if (connection.rows_in_period > 0 || connection.connected) {
    return t("mp.orders.subtitle", { marketplace: label, count: connection.rows_in_period })
  }
  return t("mp.orders.notConnected", { marketplace: label })
}

/** Where the owner fixes what the banner names: the key, or the schedule of imports. */
const NoticeLink = ({ notice, slug }: { notice: NonNullable<FeedConnection["notice"]>; slug: string }) => {
  const { t } = useTranslation()
  if (notice === "fixture") {
    return null
  }
  const to = notice === "missing" ? `/settings/integrations/${slug}` : `/marketplaces/${slug}/sync`
  return (
    <Link to={to} className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover txt-compact-small w-fit">
      {notice === "missing" ? t("mp.orders.links.connect") : t("mp.orders.links.sync")}
    </Link>
  )
}

const columnHelper = createColumnHelper<FeedOrder>()

const useColumns = () => {
  const { t } = useTranslation()
  return useMemo(
    () => [
      columnHelper.accessor("number", {
        header: () => <span>{t("mp.fields.number")}</span>,
        cell: ({ getValue }) => <span className="truncate tabular-nums">{getValue()}</span>,
        meta: { phoneTop: true },
      }),
      columnHelper.accessor("ordered_at", {
        header: () => <span>{t("mp.fields.orderedAt")}</span>,
        cell: ({ getValue }) => <DateTimeCell date={getValue()} />,
      }),
      columnHelper.accessor("status_label", {
        header: () => <span>{t("fields.status")}</span>,
        cell: ({ row }) => (
          // The marketplace's own words on hover (rule 17a): the label is ours.
          <div className="h-full w-full" title={rawStatusOf(row.original.status_raw, row.original.status_detail) ?? undefined}>
            <StatusCell color={ORDER_STATUS_COLOR[row.original.status_key] ?? "grey"}>
              {row.original.status_label}
            </StatusCell>
          </div>
        ),
        meta: { phoneWide: true },
      }),
      columnHelper.accessor("scheme", {
        header: () => <span>{t("mp.fields.scheme")}</span>,
        cell: ({ getValue }) => (getValue() ? <span>{getValue()}</span> : <PlaceholderCell />),
      }),
      columnHelper.accessor("buyer_region", {
        header: () => <span>{t("mp.fields.region")}</span>,
        cell: ({ getValue }) => (getValue() ? <span className="truncate">{getValue()}</span> : <PlaceholderCell />),
      }),
      columnHelper.accessor("warehouse_name", {
        header: () => <span>{t("mp.fields.warehouse")}</span>,
        cell: ({ getValue }) => (getValue() ? <span className="truncate">{getValue()}</span> : <PlaceholderCell />),
      }),
      columnHelper.accessor("total", {
        header: () => <div className="flex w-full justify-end">{t("fields.total")}</div>,
        cell: ({ row }) => (
          <MoneyCell amount={row.original.total} currency={row.original.currency} align="right" />
        ),
        meta: { phoneTop: "end" },
      }),
    ],
    [t]
  )
}

/**
 * The filter row. Status and scheme offer what the backend counted over every
 * order of the marketplace (`facets`), with the backend's own Russian labels;
 * the address carries the key (`status=cancelled`, `scheme=none`).
 */
const useFilters = (
  facets: { schemes: FeedFacet[]; statuses: FeedFacet[] } | undefined
): Filter[] => {
  const { t } = useTranslation()
  return useMemo(() => {
    const filters: Filter[] = []
    if (facets?.statuses.length) {
      filters.push({
        key: "status",
        label: t("fields.status"),
        type: "select",
        multiple: true,
        options: facets.statuses.map((f) => ({ label: f.label, value: f.value })),
      })
    }
    if (facets?.schemes.length) {
      filters.push({
        key: "scheme",
        label: t("mp.fields.scheme"),
        type: "select",
        multiple: true,
        options: facets.schemes.map((f) => ({ label: f.label, value: f.value })),
      })
    }
    filters.push({ key: "ordered_at", label: t("mp.fields.orderedAt"), type: "date" })
    return filters
  }, [t, facets])
}
