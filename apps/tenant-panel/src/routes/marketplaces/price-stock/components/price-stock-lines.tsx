import { Alert, Text } from "@medusajs/ui"

import { useMarketplacePriceStockLines } from "../../../../hooks/api/marketplace-price-stock"

/**
 * The expansion of one row: every warehouse and every size the marketplace
 * reported for this article (deliverable 1).
 *
 * THE LINE UNDER EACH BLOCK IS THE ARITHMETIC: «свёрнутый остаток N шт = сумма
 * K строк». The collapsed number and the lines both come out of one function
 * on the backend (`aggregateLines`), and the sum is recomputed there from the
 * very lines returned, so a mismatch is visible on the screen instead of
 * living in a report nobody runs.
 */

const NOT_SET = "—"

const money = (value: number | null, currency: string | null): string =>
  value === null ? NOT_SET : `${value.toLocaleString("ru-RU")} ${currency ?? ""}`.trim()

const units = (value: number | null): string =>
  value === null ? NOT_SET : `${value.toLocaleString("ru-RU")} шт`

const moment = (value: string | null): string => {
  if (!value) {
    return NOT_SET
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? NOT_SET
    : date.toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
}

const HEAD = [
  "Склад",
  "Размер",
  "Схема",
  "Цена, ₽ без скидки",
  "Цена, ₽ с учётом скидки",
  "Остаток, шт",
  "Резерв, шт",
  "Замер площадки",
]

export const PriceStockLines = ({
  vendorCode,
  labels,
}: {
  vendorCode: string
  labels: Record<string, string>
}) => {
  const { lines, isPending, isError, error } = useMarketplacePriceStockLines(vendorCode)

  if (isError) {
    return (
      <Alert variant="error">
        <Text size="small">{error?.message ?? "Строки не загрузились."}</Text>
      </Alert>
    )
  }

  if (isPending || !lines) {
    return (
      <Text size="small" className="text-ui-fg-subtle">
        Разворачиваем склады и размеры…
      </Text>
    )
  }

  if (!lines.columns.length) {
    return (
      <Text size="small" className="text-ui-fg-subtle">
        У артикула нет ни одной строки mp_offer: площадка не присылала ни цены, ни остатка.
      </Text>
    )
  }

  return (
    <div className="flex flex-col gap-y-4">
      {lines.columns.map((column) => {
        const check = lines.stock_check.find((entry) => entry.marketplace === column.marketplace)
        const agrees = check ? check.collapsed === check.sum_of_lines : true

        return (
          <div key={column.marketplace} className="flex flex-col gap-y-2">
            <Text size="small" weight="plus">
              {labels[column.marketplace] ?? column.marketplace}: {column.lines.length}{" "}
              {column.lines.length === 1 ? "строка" : "строк"} mp_offer
            </Text>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left">
                <thead>
                  <tr>
                    {HEAD.map((title) => (
                      <th
                        key={title}
                        className="text-ui-fg-subtle txt-compact-xsmall-plus px-3 py-1"
                      >
                        {title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody data-testid={`lines-${column.marketplace}`}>
                  {column.lines.map((line) => (
                    <tr key={line.offer_key} className="border-ui-border-base border-t">
                      <td className="px-3 py-1">
                        <Text size="xsmall">{line.warehouse_name ?? line.warehouse_id ?? NOT_SET}</Text>
                      </td>
                      <td className="px-3 py-1">
                        <Text size="xsmall">{line.size_external ?? NOT_SET}</Text>
                      </td>
                      <td className="px-3 py-1">
                        <Text size="xsmall">{line.storage_type ?? NOT_SET}</Text>
                      </td>
                      <td className="px-3 py-1 tabular-nums">
                        <Text size="xsmall">{money(line.price, line.currency)}</Text>
                      </td>
                      <td className="px-3 py-1 tabular-nums">
                        <Text size="xsmall">{money(line.discount_price, line.currency)}</Text>
                      </td>
                      <td className="px-3 py-1 tabular-nums">
                        <Text size="xsmall">{units(line.stock)}</Text>
                      </td>
                      <td className="px-3 py-1 tabular-nums">
                        <Text size="xsmall">{units(line.reserved)}</Text>
                      </td>
                      <td className="px-3 py-1 tabular-nums">
                        <Text size="xsmall">{moment(line.measured_at)}</Text>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Text
              size="xsmall"
              className={agrees ? "text-ui-fg-subtle tabular-nums" : "text-ui-fg-error tabular-nums"}
              data-testid={`stock-check-${column.marketplace}`}
            >
              Свёрнутый остаток {units(check?.collapsed ?? null)} = сумма {column.stock_lines} строк{" "}
              {units(check?.sum_of_lines ?? null)}
              {agrees ? "" : " — числа разошлись, это дефект, покажите строку нам"}
            </Text>
          </div>
        )
      })}
    </div>
  )
}
