import { Badge, Button, Text } from "@medusajs/ui"
import { useState } from "react"

import type {
  PriceStockColumn,
  PriceStockDifference,
  PriceStockRow,
} from "../../../../hooks/api/marketplace-price-stock"
import { FreshnessMark } from "./freshness"
import { PriceStockLines } from "./price-stock-lines"

/**
 * ONE TABLE: the shop's numbers and every marketplace's numbers on one line,
 * keyed by the article (w17-mp-price-stock-table).
 *
 * A plain table rather than the data-table component, for the reason the
 * catalog screen gives: the head is TWO rows — a group per side («Магазин»,
 * «Wildberries», «Ozon») over the columns of that side — and a row expands
 * into its warehouses and sizes underneath itself. The data-table primitive
 * does neither.
 *
 * EVERY HEADER SAYS WHAT THE NUMBER IS (rule 18e): «Цена на Wildberries, ₽ с
 * учётом скидки», never «WB». The unit is in the header rather than in every
 * cell, because a column of «1 214 ₽» four hundred rows deep is a column
 * nobody reads.
 *
 * READ ONLY. There is no control here that changes a marketplace number: no
 * input, no «отправить», no bulk action. The proof is a test over this very
 * file (`price-stock-read-only.unit.spec.ts`), not this paragraph.
 */

const NOT_SET = "—"

const money = (value: number | null): string =>
  value === null ? NOT_SET : value.toLocaleString("ru-RU")

const units = (value: number | null): string =>
  value === null ? NOT_SET : value.toLocaleString("ru-RU")

const signed = (value: number | null, digits = 0): string => {
  if (value === null) {
    return NOT_SET
  }
  const text = value.toLocaleString("ru-RU", { maximumFractionDigits: digits })
  return value > 0 ? `+${text}` : text
}

const DiffCell = ({ difference }: { difference: PriceStockDifference | undefined }) => {
  if (!difference || difference.abs === null) {
    return (
      <Text size="xsmall" className="text-ui-fg-muted">
        {NOT_SET}
      </Text>
    )
  }

  return (
    <div className="flex flex-col gap-y-0.5" title={difference.note}>
      <Text
        size="xsmall"
        weight={difference.highlighted ? "plus" : "regular"}
        className={difference.highlighted ? "text-ui-fg-error tabular-nums" : "text-ui-fg-subtle tabular-nums"}
      >
        {difference.metric === "price"
          ? `${signed(difference.abs, 2)} ${difference.unit}`
          : `${signed(difference.abs)} ${difference.unit}`}
      </Text>
      {difference.metric === "price" && difference.pct !== null ? (
        <Text
          size="xsmall"
          className={difference.highlighted ? "text-ui-fg-error tabular-nums" : "text-ui-fg-muted tabular-nums"}
        >
          {signed(difference.pct, 1)} %
        </Text>
      ) : null}
    </div>
  )
}

const MarketplaceCells = ({
  column,
  price,
  stock,
}: {
  column: PriceStockColumn | undefined
  price: PriceStockDifference | undefined
  stock: PriceStockDifference | undefined
}) => {
  if (!column) {
    return (
      <>
        <td className="px-3 py-3">
          <Text size="xsmall" className="text-ui-fg-muted">
            нет карточки
          </Text>
        </td>
        <td className="px-3 py-3" />
        <td className="px-3 py-3" />
        <td className="px-3 py-3" />
      </>
    )
  }

  return (
    <>
      <td className="px-3 py-3 align-top tabular-nums">
        <Text size="small">{money(column.price)}</Text>
        <FreshnessMark freshness={column.price_freshness} testId={`fresh-price-${column.marketplace}`} />
      </td>
      <td className="px-3 py-3 align-top tabular-nums">
        <Text size="small" weight="plus">
          {money(column.discount_price ?? column.effective_price)}
        </Text>
        <DiffCell difference={price} />
      </td>
      <td className="px-3 py-3 align-top tabular-nums">
        <Text size="small">{units(column.stock)}</Text>
        <FreshnessMark freshness={column.stock_freshness} testId={`fresh-stock-${column.marketplace}`} />
      </td>
      <td className="px-3 py-3 align-top tabular-nums">
        <DiffCell difference={stock} />
        <Text size="xsmall" className="text-ui-fg-muted">
          {column.lines} {column.lines === 1 ? "строка" : "строк"}
          {column.warehouses ? ` · ${column.warehouses} скл.` : ""}
          {column.sizes ? ` · ${column.sizes} разм.` : ""}
        </Text>
      </td>
    </>
  )
}

export const PriceStockTable = ({
  rows,
  marketplaces,
  labels,
}: {
  rows: PriceStockRow[]
  marketplaces: string[]
  labels: Record<string, string>
}) => {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (rows.length === 0) {
    return (
      <div className="px-6 py-6">
        <Text size="small" className="text-ui-fg-subtle">
          В этой вкладке артикулов нет.
        </Text>
      </div>
    )
  }

  const span = 4 + marketplaces.length * 4

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left" data-testid="price-stock-table">
        <thead className="border-ui-border-base border-b">
          <tr>
            <th className="text-ui-fg-subtle txt-compact-xsmall-plus px-6 py-2" colSpan={2}>
              Артикул и товар
            </th>
            <th
              className="border-ui-border-base text-ui-fg-base txt-compact-xsmall-plus border-l px-3 py-2"
              colSpan={2}
            >
              Магазин
            </th>
            {marketplaces.map((marketplace) => (
              <th
                key={marketplace}
                className="border-ui-border-base text-ui-fg-base txt-compact-xsmall-plus border-l px-3 py-2"
                colSpan={4}
              >
                {labels[marketplace] ?? marketplace}
              </th>
            ))}
          </tr>
          <tr>
            <th className="text-ui-fg-subtle txt-compact-xsmall px-6 py-2">Артикул</th>
            <th className="text-ui-fg-subtle txt-compact-xsmall px-3 py-2">Товар магазина</th>
            <th className="border-ui-border-base text-ui-fg-subtle txt-compact-xsmall border-l px-3 py-2">
              Цена в магазине, ₽
            </th>
            <th className="text-ui-fg-subtle txt-compact-xsmall px-3 py-2">
              Остаток в магазине, шт
            </th>
            {marketplaces.map((marketplace) => {
              const label = labels[marketplace] ?? marketplace
              return [
                <th
                  key={`${marketplace}-price`}
                  className="border-ui-border-base text-ui-fg-subtle txt-compact-xsmall border-l px-3 py-2"
                >
                  Цена на {label}, ₽ без скидки
                </th>,
                <th
                  key={`${marketplace}-discount`}
                  className="text-ui-fg-subtle txt-compact-xsmall px-3 py-2"
                >
                  Цена на {label}, ₽ с учётом скидки · расхождение с магазином
                </th>,
                <th
                  key={`${marketplace}-stock`}
                  className="text-ui-fg-subtle txt-compact-xsmall px-3 py-2"
                >
                  Остаток на {label}, шт
                </th>,
                <th
                  key={`${marketplace}-stock-diff`}
                  className="text-ui-fg-subtle txt-compact-xsmall px-3 py-2"
                >
                  Расхождение остатка, шт · из скольких строк
                </th>,
              ]
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const open = expanded === row.vendor_code
            const totalLines = row.columns.reduce((sum, column) => sum + column.lines, 0)

            return [
              <tr
                key={row.vendor_code}
                className="border-ui-border-base border-b last:border-b-0"
                data-testid={`row-${row.vendor_code}`}
              >
                <td className="px-6 py-3 align-top">
                  <div className="flex flex-col items-start gap-y-1">
                    <Text size="small" weight="plus">
                      {row.vendor_code}
                    </Text>
                    {row.over_threshold ? (
                      <Badge size="2xsmall" color="red">
                        выше порога
                      </Badge>
                    ) : null}
                    {totalLines > 0 ? (
                      <Button
                        size="small"
                        variant="transparent"
                        onClick={() => setExpanded(open ? null : row.vendor_code)}
                        data-testid={`expand-${row.vendor_code}`}
                      >
                        {open ? "Свернуть склады и размеры" : `Склады и размеры (${totalLines})`}
                      </Button>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-3 align-top">
                  <Text size="small">{row.shop?.product_title ?? NOT_SET}</Text>
                  {row.shop?.sku ? (
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      SKU {row.shop.sku}
                    </Text>
                  ) : null}
                </td>
                <td className="border-ui-border-base border-l px-3 py-3 align-top tabular-nums">
                  <Text size="small">{money(row.shop?.price ?? null)}</Text>
                </td>
                <td className="px-3 py-3 align-top tabular-nums">
                  <Text size="small">{units(row.shop?.stock ?? null)}</Text>
                </td>
                {marketplaces.map((marketplace) => (
                  <MarketplaceCells
                    key={marketplace}
                    column={row.columns.find((column) => column.marketplace === marketplace)}
                    price={row.differences.find(
                      (difference) =>
                        difference.marketplace === marketplace && difference.metric === "price"
                    )}
                    stock={row.differences.find(
                      (difference) =>
                        difference.marketplace === marketplace && difference.metric === "stock"
                    )}
                  />
                ))}
              </tr>,
              open ? (
                <tr key={`${row.vendor_code}-lines`} className="bg-ui-bg-subtle">
                  <td colSpan={span} className="px-6 py-4">
                    <PriceStockLines vendorCode={row.vendor_code} labels={labels} />
                  </td>
                </tr>
              ) : null,
            ]
          })}
        </tbody>
      </table>
    </div>
  )
}
