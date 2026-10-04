import { ArrowDownTray, ArrowUpRightOnBox, PencilSquare } from "@medusajs/icons"
import { Button, Tooltip, toast } from "@medusajs/ui"
import { keepPreviousData } from "@tanstack/react-query"
import { createColumnHelper } from "@tanstack/react-table"
import { useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"

import { ActionMenu } from "../../../components/common/action-menu"
import { Filter } from "../../../components/table/data-table"
import { _DataTable } from "../../../components/table/data-table/data-table"
import { PlaceholderCell } from "../../../components/table/table-cells/common/placeholder-cell"
import { StatusCell } from "../../../components/table/table-cells/common/status-cell"
import { useDataTable } from "../../../hooks/use-data-table"
import { useDate } from "../../../hooks/use-date"
import {
  MARKETPLACE_LABEL,
  MP_FIXTURES,
  mpPriceStockExportPath,
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

/**
 * «Wildberries → Цены и остатки» (mp-section-design): the shop's price and
 * stock next to the marketplace's, one row per card, in the same `_DataTable`
 * as the shop's products. READ ONLY, as w17 decided: no input, no «отправить».
 *
 * What changed against the w17 screen: the four button-tabs became one filter
 * («Где есть»), the threshold inputs became two filters with a short list of
 * values, the arithmetic line is gone (the pagination says how many rows match),
 * and the stale mark sits in the «Обновлено» column rather than under every
 * number. The warehouses and sizes behind a card stay in a tooltip on the
 * stock, where the number is; a full breakdown is the row's own screen in a
 * later task.
 */

const PAGE_SIZE = 20
const FILTER_KEYS = ["state", "over_threshold", "price_pct", "stock_abs"] as const
const STATES: MpPriceStockState[] = ["both", "shop_only", "marketplace_only"]

export const MpPriceStock = ({ marketplace = "wb" }: { marketplace?: MarketplaceId }) => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()
  const { params, raw } = useMpListQuery([...FILTER_KEYS], PAGE_SIZE)

  const query: MpPriceStockParams = {
    ...params,
    state: params.state as MpPriceStockState[] | undefined,
    over_threshold: params.over_threshold?.[0] === "true" ? ("true" as const) : undefined,
    price_pct: params.price_pct?.[0] ? Number(params.price_pct[0]) : undefined,
    stock_abs: params.stock_abs?.[0] ? Number(params.stock_abs[0]) : undefined,
  }
  const { rows, count, measured, thresholds, isLoading, isError, error } = useMpPriceStock(
    marketplace,
    query,
    { placeholderData: keepPreviousData }
  )

  const columns = useColumns(marketplace)
  const filters = useFilters()
  const { table } = useDataTable({
    data: rows ?? [],
    columns,
    count: count ?? 0,
    enablePagination: true,
    pageSize: PAGE_SIZE,
    getRowId: (row) => row.id,
  })

  const download = useCallback(async () => {
    if (MP_FIXTURES) {
      toast.success(t("mp.priceStock.toasts.exported", { count: count ?? 0 }))
      return
    }
    try {
      const response = await sdk.client.fetch<Response>(mpPriceStockExportPath(marketplace, query), {
        headers: { accept: "text/csv" },
      })
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `${marketplace}-price-stock-${new Date().toISOString().slice(0, 10)}.csv`
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
  const subtitle = measured
    ? t("mp.priceStock.measured", {
        marketplace: label,
        prices: measured.prices_at ? getFullDate({ date: measured.prices_at, includeTime: true }) : "—",
        stocks: measured.stocks_at ? getFullDate({ date: measured.stocks_at, includeTime: true }) : "—",
        pricePct: thresholds?.price_pct ?? 10,
        stockAbs: thresholds?.stock_abs ?? 1,
      })
    : null

  return (
    <MpPage
      title={t("mp.priceStock.title")}
      subtitle={subtitle}
      actions={
        <Button size="small" variant="secondary" onClick={download} disabled={!count}>
          <ArrowDownTray />
          {t("mp.priceStock.export")}
        </Button>
      }
    >
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
        orderBy={
          [
            { key: "title", label: t("fields.title") },
            { key: "vendor_code", label: t("mp.fields.vendorCode") },
            // Sorting keys the backend understands; two of them are not row fields.
            { key: "price_pct", label: t("mp.priceStock.orderBy.priceDiff") },
            { key: "stock_abs", label: t("mp.priceStock.orderBy.stockDiff") },
          ] as { key: keyof MpPriceStockRow; label: string }[]
        }
        noRecords={{
          title: t("mp.priceStock.empty.title"),
          message: t("mp.priceStock.empty.message", { marketplace: label }),
        }}
      />
    </MpPage>
  )
}

const columnHelper = createColumnHelper<MpPriceStockRow>()

const useColumns = (marketplace: MarketplaceId) => {
  const { t } = useTranslation()
  const label = MARKETPLACE_LABEL[marketplace]

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
                reserved: mp.reserved ?? 0,
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
        cell: ({ row }) => {
          const mp = row.original.mp
          if (!mp) {
            return <PlaceholderCell />
          }
          return mp.stock_stale || mp.price_stale ? (
            <StatusCell color="orange">{t("mp.priceStock.stale")}</StatusCell>
          ) : (
            <DateTimeCell date={mp.stock_measured_at ?? mp.price_measured_at} />
          )
        },
      }),
      columnHelper.display({
        id: "actions",
        cell: ({ row }) => (
          <ActionMenu
            groups={[
              {
                actions: [
                  ...(row.original.shop
                    ? [
                        {
                          icon: <PencilSquare />,
                          label: t("mp.products.actions.openShopProduct"),
                          to: `/products/${row.original.shop.product_id}`,
                        },
                      ]
                    : []),
                  ...(row.original.external_id
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
    [t, label]
  )
}

const useFilters = (): Filter[] => {
  const { t } = useTranslation()
  return useMemo(
    () => [
      {
        key: "state",
        label: t("mp.priceStock.columns.state"),
        type: "select",
        multiple: true,
        options: STATES.map((state) => ({
          label: t(`mp.priceStock.state.${state}`, { marketplace: "Wildberries" }),
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
    [t]
  )
}
