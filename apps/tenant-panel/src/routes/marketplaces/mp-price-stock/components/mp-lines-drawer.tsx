import { Drawer, Text } from "@medusajs/ui"
import { createColumnHelper } from "@tanstack/react-table"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { DataTableRoot } from "../../../../components/table/data-table/data-table-root"
import { useDataTable } from "../../../../hooks/use-data-table"
import {
  MARKETPLACE_LABEL,
  useMpPriceStockLines,
  type MarketplaceId,
  type MpOfferLine,
  type MpPriceStockRow,
} from "../../../../hooks/api/marketplace-section"
import { DateTimeCell, MoneyCell, UnitsCell } from "../../common/mp-cells"

/**
 * «Строки по складам» of one row (task-03): every size of the card on every
 * warehouse, with the price, the stock, the reserve and when the marketplace
 * measured it. The row's stock is the sum of the stocks below, by the one
 * function that decides both (`aggregateLines` on the backend), and the
 * drawer's footer line says so with the row's own numbers.
 *
 * All lines at once, without pages: a card has 65 lines at most on the stand
 * (2026-10-05, median 2), and a pager in a drawer would write its offset into
 * the screen's address.
 *
 * READ ONLY like the screen: a table and nothing to type into.
 */

const lineHelper = createColumnHelper<MpOfferLine>()

export const MpLinesDrawer = ({
  marketplace,
  row,
  onClose,
}: {
  marketplace: MarketplaceId
  row: MpPriceStockRow
  onClose: () => void
}) => {
  const { t } = useTranslation()
  const label = MARKETPLACE_LABEL[marketplace]
  const { lines, isPending, isError, error } = useMpPriceStockLines(marketplace, row.external_id ?? "", {
    enabled: Boolean(row.external_id),
  })

  const columns = useMemo(
    () => [
      lineHelper.accessor("size", {
        header: () => <span>{t("mp.priceStock.lines.size")}</span>,
        cell: ({ getValue }) => <span className="truncate">{getValue() ?? t("mp.priceStock.lines.oneSize")}</span>,
        meta: { phoneTop: true },
      }),
      lineHelper.accessor("warehouse", {
        header: () => <span>{t("mp.fields.warehouse")}</span>,
        cell: ({ getValue }) => (
          <span className="truncate">{getValue() ?? t("mp.priceStock.lines.noWarehouse")}</span>
        ),
      }),
      lineHelper.display({
        id: "price",
        header: () => <span>{t("fields.price")}</span>,
        cell: ({ row: line }) => (
          <MoneyCell
            amount={line.original.discount_price ?? line.original.price}
            strike={line.original.discount_price ? line.original.price : null}
            currency={row.currency}
          />
        ),
        meta: { phoneTop: "end" },
      }),
      lineHelper.accessor("stock", {
        header: () => <span>{t("mp.fields.stock")}</span>,
        cell: ({ getValue }) => <UnitsCell value={getValue()} unit={t("mp.units.pcs")} />,
      }),
      lineHelper.accessor("reserved", {
        header: () => <span>{t("mp.priceStock.lines.reserved")}</span>,
        cell: ({ getValue }) => <UnitsCell value={getValue()} unit={t("mp.units.pcs")} />,
      }),
      lineHelper.accessor("measured_at", {
        header: () => <span>{t("mp.priceStock.lines.measuredAt")}</span>,
        cell: ({ getValue }) => <DateTimeCell date={getValue()} />,
      }),
    ],
    [t, row.currency]
  )

  const all = lines ?? []
  const { table } = useDataTable({
    data: all,
    columns,
    count: all.length,
    enablePagination: false,
    pageSize: Math.max(all.length, 1),
  })

  return (
    <Drawer open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <Drawer.Content className="md:max-w-[900px]">
        <Drawer.Header>
          <Drawer.Title>{t("mp.priceStock.lines.title")}</Drawer.Title>
          <Drawer.Description>
            {t("mp.priceStock.lines.description", {
              marketplace: label,
              title: row.title ?? row.external_id ?? "—",
              vendorCode: row.vendor_code ?? "—",
            })}
          </Drawer.Description>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-y-4 overflow-y-auto p-0">
          {isPending ? (
            <Text size="small" className="text-ui-fg-subtle px-6 py-4">
              {t("general.loading")}
            </Text>
          ) : isError ? (
            <div className="flex flex-col gap-y-1 px-6 py-4">
              <Text size="small" className="text-ui-fg-error">
                {t("mp.priceStock.lines.loadFailed")}
              </Text>
              <details className="text-ui-fg-subtle txt-compact-xsmall">
                <summary className="cursor-pointer">{t("mp.priceStock.supportDetails")}</summary>
                <span className="break-all">{error?.message}</span>
              </details>
            </div>
          ) : all.length === 0 ? (
            <Text size="small" className="text-ui-fg-subtle px-6 py-4">
              {t("mp.priceStock.lines.empty", { marketplace: label })}
            </Text>
          ) : (
            <>
              <DataTableRoot table={table} columns={columns} count={all.length} />
              <Text size="small" className="text-ui-fg-subtle px-6 pb-4" data-testid="mp-lines-total">
                {row.mp && row.mp.stock !== null
                  ? t("mp.priceStock.lines.total", {
                      count: all.length,
                      stock: row.mp.stock,
                      stocked: all.filter((line) => line.stock !== null).length,
                    })
                  : t("mp.priceStock.lines.totalNoStock", { count: all.length })}
              </Text>
            </>
          )}
        </Drawer.Body>
      </Drawer.Content>
    </Drawer>
  )
}
