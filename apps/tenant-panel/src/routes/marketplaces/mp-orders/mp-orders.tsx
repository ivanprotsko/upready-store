import { ArrowDownTray } from "@medusajs/icons"
import { Alert, Button, Text, toast } from "@medusajs/ui"
import { keepPreviousData } from "@tanstack/react-query"
import { createColumnHelper } from "@tanstack/react-table"
import { useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"

import { SupportDetails, marketplaceErrorKey } from "../../../components/common/support-details"
import { Filter } from "../../../components/table/data-table"
import { _DataTable } from "../../../components/table/data-table/data-table"
import { PlaceholderCell } from "../../../components/table/table-cells/common/placeholder-cell"
import { StatusCell } from "../../../components/table/table-cells/common/status-cell"
import { useDataTable } from "../../../hooks/use-data-table"
import type { FeedOrder, OrderStatusKey } from "../../../hooks/api/marketplace-orders"
import {
  MARKETPLACE_LABEL,
  MP_FIXTURES,
  mpOrdersExportPath,
  slugOf,
  useMpOrders,
  type MarketplaceId,
} from "../../../hooks/api/marketplace-section"
import { sdk } from "../../../lib/client"
import { DateTimeCell, MoneyCell } from "../common/mp-cells"
import { MpPage } from "../common/mp-page"
import { useMpListQuery } from "../common/use-mp-list-query"

/**
 * «Wildberries → Заказы» (mp-section-design): the marketplace's orders as the
 * import stored them in `mp_order`, in the shop's own orders table: the same
 * `_DataTable`, status as a coloured dot, date with time, sum on the right,
 * a row opens the order. READ ONLY as w15 decided (Ivan, 2026-09-16 02:46):
 * nothing here changes an order on the marketplace.
 *
 * What changed against the w15 desk: the shop's own orders are not mixed in
 * (they live under «Продажи → Заказы»; this section is one marketplace), the
 * badge-chip filters became the shop's filter row, «Показать ещё» became
 * pages, and the connection banner shows only when there is something to say.
 */

const PAGE_SIZE = 20
const FILTER_KEYS = ["status", "scheme", "ordered_at"] as const

const STATUS_COLOR: Record<OrderStatusKey, "green" | "red" | "blue" | "orange" | "grey" | "purple"> = {
  new: "blue",
  processing: "orange",
  shipped: "purple",
  delivered: "green",
  cancelled: "red",
  returned: "red",
  unspecified: "grey",
  other: "grey",
}

const BANNER: Record<string, "info" | "warning" | "error"> = {
  missing: "info",
  never_run: "warning",
  failed: "error",
  rate_limited: "warning",
  fixture: "warning",
}

export const MpOrders = ({ marketplace = "wb" }: { marketplace?: MarketplaceId }) => {
  const { t } = useTranslation()
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

  const download = useCallback(async () => {
    if (MP_FIXTURES) {
      toast.success(t("mp.orders.toasts.exported", { count: count ?? 0 }))
      return
    }
    try {
      const response = await sdk.client.fetch<Response>(mpOrdersExportPath(marketplace, query), {
        headers: { accept: "text/csv" },
      })
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `${marketplace}-orders-${new Date().toISOString().slice(0, 10)}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : String(failure))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `query` is rebuilt every render; its parts are what matter
  }, [marketplace, raw, count, t])

  if (isError) {
    throw error
  }

  const label = MARKETPLACE_LABEL[marketplace]

  return (
    <MpPage
      title={t("mp.orders.title")}
      subtitle={
        connection
          ? connection.connected
            ? t("mp.orders.subtitle", { marketplace: label, count: connection.rows_in_period })
            : t("mp.orders.notConnected", { marketplace: label })
          : null
      }
      actions={
        <Button size="small" variant="secondary" onClick={download} disabled={!count}>
          <ArrowDownTray />
          {t("mp.orders.export")}
        </Button>
      }
    >
      {connection?.notice ? (
        <div className="px-6 py-4">
          <Alert variant={BANNER[connection.notice] ?? "warning"}>
            <Text size="small">
              {t(`marketplaceOrders.connection.${connection.notice}`, {
                marketplace: label,
                error: t(marketplaceErrorKey(connection.last_run?.error)),
              })}
            </Text>
            {connection.notice === "failed" && connection.last_run?.error ? (
              <SupportDetails text={connection.last_run.error} />
            ) : null}
          </Alert>
        </div>
      ) : null}
      {undated ? (
        <div className="px-6 py-3">
          <Text size="small" className="text-ui-fg-subtle">
            {t("marketplaceOrders.period.undated", { count: undated })}
          </Text>
        </div>
      ) : null}
      <_DataTable
        table={table}
        columns={columns}
        count={count ?? 0}
        pageSize={PAGE_SIZE}
        filters={filters}
        search
        pagination
        isLoading={isLoading}
        queryObject={raw}
        navigateTo={(row) => `/marketplaces/${slugOf(marketplace)}/orders/${row.original.id}`}
        orderBy={[
          { key: "ordered_at", label: t("mp.fields.orderedAt") },
          { key: "total", label: t("fields.total") },
          { key: "number", label: t("mp.fields.number") },
        ]}
        noRecords={{
          title: t("mp.orders.empty.title"),
          message: t("mp.orders.empty.message", { marketplace: label }),
        }}
      />
    </MpPage>
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
          <StatusCell color={STATUS_COLOR[row.original.status_key] ?? "grey"}>
            {row.original.status_label}
          </StatusCell>
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

const useFilters = (
  facets: { schemes: Array<{ value: string; label: string; count: number }>; statuses: Array<{ value: string; label: string; count: number }> } | undefined
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
