import { ArrowDownTray, ArrowUpRightOnBox, Buildings, Eye, PencilSquare } from "@medusajs/icons"
import { Button, Tooltip, toast } from "@medusajs/ui"
import { keepPreviousData } from "@tanstack/react-query"
import { createColumnHelper } from "@tanstack/react-table"
import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { ActionMenu } from "../../../components/common/action-menu"
import { Filter } from "../../../components/table/data-table"
import { _DataTable } from "../../../components/table/data-table/data-table"
import { DataTableQuery } from "../../../components/table/data-table/data-table-query"
import { PlaceholderCell } from "../../../components/table/table-cells/common/placeholder-cell"
import { StatusCell } from "../../../components/table/table-cells/common/status-cell"
import { useDataTable } from "../../../hooks/use-data-table"
import { useDate } from "../../../hooks/use-date"
import {
  MARKETPLACE_LABEL,
  MP_FIXTURES,
  mpPriceStockExportPath,
  slugOf,
  useMpPriceStock,
  type MarketplaceId,
  type MpPriceStockParams,
  type MpPriceStockRow,
  type MpPriceStockState,
} from "../../../hooks/api/marketplace-section"
import { sdk } from "../../../lib/client"
import { CardCell, DateTimeCell, DiffLine, MoneyCell, UnitsCell } from "../common/mp-cells"
import { MpPage } from "../common/mp-page"
import { useMpListQuery } from "../common/use-mp-list-query"
import { useRouteMarketplace } from "../common/use-route-marketplace"
import { MpLinesDrawer } from "./components/mp-lines-drawer"
import { MpPriceStockEmpty, emptyReasonOf } from "./components/mp-price-stock-empty"

/**
 * «Wildberries → Цены и остатки» (mp-section-design, task-03): the shop's price
 * and stock next to the marketplace's, one row per card and one per shop
 * product no card is linked to, in the same `_DataTable` as the shop's
 * products. READ ONLY, as w17 decided: no input, no «отправить».
 *
 * The thresholds are filters with a short list of values, the stale mark sits
 * in the «Обновлено» column with the measured time in its tooltip, and the
 * warehouses and sizes behind a card open in a drawer from the row's menu.
 * Every number comes from our own database: opening the screen sends nothing
 * to the marketplace.
 */

const PAGE_SIZE = 20
const FILTER_KEYS = ["state", "over_threshold", "price_pct", "stock_abs"] as const
const STATES: MpPriceStockState[] = ["both", "shop_only", "marketplace_only"]
/** The export's ceiling on the backend (`PRICE_STOCK_EXPORT_LIMIT`). */
const EXPORT_LIMIT = 10_000

export const MpPriceStock = ({ marketplace: forced }: { marketplace?: MarketplaceId }) => {
  const fromRoute = useRouteMarketplace()
  const marketplace = forced ?? fromRoute
  const { t } = useTranslation()
  const { getFullDate } = useDate()
  const { params, raw } = useMpListQuery([...FILTER_KEYS], PAGE_SIZE)
  const [linesOf, setLinesOf] = useState<MpPriceStockRow | null>(null)

  const query: MpPriceStockParams = {
    ...params,
    state: params.state as MpPriceStockState[] | undefined,
    over_threshold: params.over_threshold?.[0] === "true" ? ("true" as const) : undefined,
    price_pct: params.price_pct?.[0] ? Number(params.price_pct[0]) : undefined,
    stock_abs: params.stock_abs?.[0] ? Number(params.stock_abs[0]) : undefined,
  }
  const { rows, count, measured, thresholds, counts, stored, isLoading, isError, error } = useMpPriceStock(
    marketplace,
    query,
    { placeholderData: keepPreviousData }
  )

  const columns = useColumns(marketplace, setLinesOf)
  const filters = useFilters(marketplace)
  const orderBy = [
    { key: "title", label: t("fields.title") },
    { key: "vendor_code", label: t("mp.fields.vendorCode") },
    // Sorting keys the backend understands; two of them are not row fields.
    { key: "price_pct", label: t("mp.priceStock.orderBy.priceDiff") },
    { key: "stock_abs", label: t("mp.priceStock.orderBy.stockDiff") },
  ] as { key: keyof MpPriceStockRow; label: string }[]
  const { table } = useDataTable({
    data: rows ?? [],
    columns,
    count: count ?? 0,
    enablePagination: true,
    pageSize: PAGE_SIZE,
    getRowId: (row) => row.id,
  })

  const exportPath = mpPriceStockExportPath(marketplace, query)
  const total = count ?? 0

  /**
   * The export is fetched through the SDK rather than opened as a link: the
   * panel authenticates with a bearer token a plain navigation would not
   * carry, and `accept: text/csv` makes the SDK hand back the raw `Response`
   * instead of parsing it as JSON (the way «Заказы» downloads its file).
   */
  const download = useCallback(async () => {
    const inFile = Math.min(total, EXPORT_LIMIT)
    if (MP_FIXTURES) {
      toast.success(t("mp.priceStock.toasts.exported", { count: inFile }))
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
      anchor.download = `${slugOf(marketplace)}-price-stock-${new Date().toISOString().slice(0, 10)}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
      if (total > EXPORT_LIMIT) {
        toast.warning(t("mp.priceStock.toasts.truncated", { count: total, limit: EXPORT_LIMIT }))
      } else {
        toast.success(t("mp.priceStock.toasts.exported", { count: inFile }))
      }
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : t("mp.priceStock.toasts.exportFailed"))
    }
  }, [exportPath, marketplace, total, t])

  // After every hook: a throw hands the failure to the route's ErrorBoundary.
  if (isError) {
    throw error
  }

  const label = MARKETPLACE_LABEL[marketplace]
  const subtitle = measured
    ? t("mp.priceStock.measured", {
        marketplace: label,
        prices: measured.prices_at ? getFullDate({ date: measured.prices_at, includeTime: true }) : "-",
        stocks: measured.stocks_at ? getFullDate({ date: measured.stocks_at, includeTime: true }) : "-",
        pricePct: thresholds?.price_pct ?? 10,
        stockAbs: thresholds?.stock_abs ?? 1,
      })
    : null

  const reason = isLoading ? null : emptyReasonOf({ count: total, stored, counts, query })

  return (
    <MpPage
      title={t("mp.priceStock.title")}
      subtitle={subtitle}
      actions={
        <Button size="small" variant="secondary" onClick={download} disabled={!total}>
          <ArrowDownTray />
          {t("mp.priceStock.export")}
        </Button>
      }
    >
      {reason === "nothing" || reason === "no_prices" ? (
        <MpPriceStockEmpty marketplace={marketplace} reason={reason} stored={stored} />
      ) : reason === "no_links" ? (
        // The filter row stays, so the owner can take back the filter that
        // emptied the table; the reason replaces the bare «нет результатов».
        <div className="divide-y">
          <DataTableQuery search orderBy={orderBy} filters={filters} />
          <MpPriceStockEmpty marketplace={marketplace} reason={reason} stored={stored} />
        </div>
      ) : (
        <_DataTable
          table={table}
          columns={columns}
          count={total}
          pageSize={PAGE_SIZE}
          filters={filters}
          search
          pagination
          isLoading={isLoading}
          queryObject={raw}
          orderBy={orderBy}
          noRecords={{
            title: t("mp.priceStock.empty.title"),
            message: t("mp.priceStock.empty.message", { marketplace: label }),
          }}
        />
      )}
      {linesOf ? <MpLinesDrawer marketplace={marketplace} row={linesOf} onClose={() => setLinesOf(null)} /> : null}
    </MpPage>
  )
}

const columnHelper = createColumnHelper<MpPriceStockRow>()

/** «Устарело» in orange, the moment it was measured in the tooltip: the date is not lost under the mark. */
const MeasuredCell = ({ row }: { row: MpPriceStockRow }) => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()
  const mp = row.mp
  const date = mp ? (mp.stock_measured_at ?? mp.price_measured_at) : null
  if (!mp || !date) {
    return <PlaceholderCell />
  }
  if (!mp.stock_stale && !mp.price_stale) {
    return <DateTimeCell date={date} />
  }
  return (
    <Tooltip content={t("mp.priceStock.staleHint", { date: getFullDate({ date, includeTime: true }) })}>
      <div className="h-full w-full">
        <StatusCell color="orange">{t("mp.priceStock.stale")}</StatusCell>
      </div>
    </Tooltip>
  )
}

const useColumns = (marketplace: MarketplaceId, openLines: (row: MpPriceStockRow) => void) => {
  const { t } = useTranslation()
  const label = MARKETPLACE_LABEL[marketplace]
  const slug = slugOf(marketplace)

  return useMemo(
    () => [
      columnHelper.display({
        id: "product",
        header: () => <span>{t("fields.product")}</span>,
        cell: ({ row }) => (
          <CardCell
            title={row.original.title}
            thumbnail={row.original.thumbnail}
            subtitle={row.original.vendor_code}
          />
        ),
        meta: { phoneTop: true },
      }),
      columnHelper.display({
        id: "shop_price",
        header: () => <span>{t("mp.priceStock.columns.shopPrice")}</span>,
        cell: ({ row }) => <MoneyCell amount={row.original.shop?.price} currency={row.original.currency} />,
      }),
      columnHelper.display({
        id: "mp_price",
        header: () => <span>{t("mp.priceStock.columns.mpPrice", { marketplace: label })}</span>,
        cell: ({ row }) =>
          row.original.mp ? (
            <div className="flex h-full w-full flex-col justify-center overflow-hidden">
              <MoneyCell
                amount={row.original.mp.discount_price ?? row.original.mp.price}
                strike={row.original.mp.discount_price ? row.original.mp.price : null}
                currency={row.original.currency}
              />
              <DiffLine
                abs={row.original.diff.price_abs}
                pct={row.original.diff.price_pct}
                unit="₽"
                highlighted={row.original.diff.highlighted && row.original.diff.price_abs !== null}
              />
            </div>
          ) : (
            <PlaceholderCell />
          ),
        meta: { phoneTop: "end" },
      }),
      columnHelper.display({
        id: "shop_stock",
        header: () => <span>{t("mp.priceStock.columns.shopStock")}</span>,
        cell: ({ row }) => <UnitsCell value={row.original.shop?.stock} unit={t("mp.units.pcs")} />,
      }),
      columnHelper.display({
        id: "mp_stock",
        header: () => <span>{t("mp.priceStock.columns.mpStock", { marketplace: label })}</span>,
        cell: ({ row }) => {
          const mp = row.original.mp
          if (!mp) {
            return <PlaceholderCell />
          }
          return (
            <Tooltip
              content={t("mp.priceStock.linesHint", {
                lines: mp.lines,
                warehouses: mp.warehouses,
                sizes: mp.sizes,
                reserved: mp.reserved ?? "-",
              })}
            >
              <div className="flex h-full w-full flex-col justify-center overflow-hidden">
                <UnitsCell value={mp.stock} unit={t("mp.units.pcs")} />
                <DiffLine
                  abs={row.original.diff.stock_abs}
                  unit={t("mp.units.pcs")}
                  highlighted={row.original.diff.highlighted && row.original.diff.stock_abs !== null}
                />
              </div>
            </Tooltip>
          )
        },
      }),
      columnHelper.display({
        id: "state",
        header: () => <span>{t("mp.priceStock.columns.state")}</span>,
        cell: ({ row }) => (
          <StatusCell
            color={row.original.state === "both" ? "green" : row.original.state === "shop_only" ? "grey" : "orange"}
          >
            {t(`mp.priceStock.state.${row.original.state}`, { marketplace: label })}
          </StatusCell>
        ),
        meta: { phoneWide: true },
      }),
      columnHelper.display({
        id: "measured",
        header: () => <span>{t("mp.fields.updatedAt")}</span>,
        cell: ({ row }) => <MeasuredCell row={row.original} />,
      }),
      columnHelper.display({
        id: "actions",
        cell: ({ row }) => (
          <ActionMenu
            groups={[
              {
                actions: [
                  ...(row.original.mp && row.original.external_id
                    ? [
                        {
                          icon: <Buildings />,
                          label: t("mp.priceStock.actions.lines"),
                          onClick: () => openLines(row.original),
                        },
                      ]
                    : []),
                  ...(row.original.card_id
                    ? [
                        {
                          icon: <Eye />,
                          label: t("mp.products.actions.openCard"),
                          to: `/marketplaces/${slug}/products/${row.original.card_id}`,
                        },
                      ]
                    : []),
                  ...(row.original.shop
                    ? [
                        {
                          icon: <PencilSquare />,
                          label: t("mp.products.actions.openShopProduct"),
                          to: `/products/${row.original.shop.product_id}`,
                        },
                      ]
                    : []),
                  ...(marketplace === "wb" && row.original.external_id
                    ? [
                        {
                          icon: <ArrowUpRightOnBox />,
                          label: t("mp.products.actions.openOnMarketplace", { marketplace: label }),
                          to: `https://www.wildberries.ru/catalog/${row.original.external_id}/detail.aspx`,
                        },
                      ]
                    : []),
                ],
              },
            ]}
          />
        ),
      }),
    ],
    [t, label, slug, marketplace, openLines]
  )
}

const useFilters = (marketplace: MarketplaceId): Filter[] => {
  const { t } = useTranslation()
  const label = MARKETPLACE_LABEL[marketplace]
  return useMemo(
    () => [
      {
        key: "state",
        label: t("mp.priceStock.columns.state"),
        type: "select",
        multiple: true,
        options: STATES.map((state) => ({
          label: t(`mp.priceStock.state.${state}`, { marketplace: label }),
          value: state,
        })),
      },
      {
        key: "over_threshold",
        label: t("mp.priceStock.filters.overThreshold"),
        type: "select",
        options: [{ label: t("mp.priceStock.filters.onlyOver"), value: "true" }],
      },
      {
        key: "price_pct",
        label: t("mp.priceStock.filters.pricePct"),
        type: "select",
        options: [5, 10, 15, 20, 30].map((v) => ({ label: `${v} %`, value: String(v) })),
      },
      {
        key: "stock_abs",
        label: t("mp.priceStock.filters.stockAbs"),
        type: "select",
        options: [1, 3, 5, 10, 20].map((v) => ({ label: `${v} ${t("mp.units.pcs")}`, value: String(v) })),
      },
    ],
    [t, label]
  )
}
