import { Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import type { WbTablesResponse } from "../../../../hooks/api/wb-tables"

const NOT_SET = "—"

/**
 * What WB sold for this shop over the last month
 * (w03-wb-sales-questions-mirror).
 *
 * Two numbers head the table, and they are different money: `customer_paid`
 * is WB's `finishedPrice` (what the buyer paid) and `for_pay` is WB's
 * `forPay` (what WB transfers to the shop). Showing one of them as "выручка"
 * would be a guess about which one the owner means, so both are named.
 *
 * The feed carries returns too — WB's own sentence is "The method returns
 * sale and return information" — so the count of return lines stands next to
 * the totals instead of being folded into them.
 *
 * An empty table says which of the two possible empties it is: the import has
 * not run, or it ran and WB had nothing (rule 20a).
 */
export const WbSalesTable = ({ sales }: { sales: WbTablesResponse["sales"] }) => {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || "ru"

  const money = (value: number | null): string =>
    value === null ? NOT_SET : value.toLocaleString(locale, { maximumFractionDigits: 2 })

  const dateTime = (value: string | null): string => {
    if (!value) {
      return NOT_SET
    }
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? NOT_SET : date.toLocaleString(locale)
  }

  return (
    <div className="flex flex-col gap-y-3">
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <div className="flex flex-col">
          <Text className="text-ui-fg-subtle" size="small">
            {t("wildberries.sales.lines")}
          </Text>
          <Text className="tabular-nums" weight="plus">
            {sales.lines}
          </Text>
        </div>
        <div className="flex flex-col">
          <Text className="text-ui-fg-subtle" size="small">
            {t("wildberries.sales.customerPaid")}
          </Text>
          <Text className="tabular-nums" weight="plus">
            {money(sales.customer_paid)}
          </Text>
        </div>
        <div className="flex flex-col">
          <Text className="text-ui-fg-subtle" size="small">
            {t("wildberries.sales.forPay")}
          </Text>
          <Text className="tabular-nums" weight="plus">
            {money(sales.for_pay)}
          </Text>
        </div>
        <div className="flex flex-col">
          <Text className="text-ui-fg-subtle" size="small">
            {t("wildberries.sales.returnLines")}
          </Text>
          <Text className="tabular-nums" weight="plus">
            {sales.return_lines}
          </Text>
        </div>
      </div>

      {sales.rows.length ? (
        <div className="overflow-x-auto">
          <table className="txt-compact-small w-full min-w-[720px] text-left">
            <thead className="text-ui-fg-subtle">
              <tr className="border-ui-border-base border-b">
                <th className="py-2 pr-4 font-normal">{t("wildberries.sales.when")}</th>
                <th className="py-2 pr-4 font-normal">{t("wildberries.sales.item")}</th>
                <th className="py-2 pr-4 font-normal">{t("wildberries.sales.size")}</th>
                <th className="py-2 pr-4 text-right font-normal">
                  {t("wildberries.sales.customerPaid")}
                </th>
                <th className="py-2 pr-4 text-right font-normal">
                  {t("wildberries.sales.forPay")}
                </th>
                <th className="py-2 font-normal">{t("wildberries.sales.where")}</th>
              </tr>
            </thead>
            <tbody>
              {sales.rows.map((row) => (
                <tr
                  key={`${row.srid}-${row.sale_id ?? ""}`}
                  className="border-ui-border-base border-b last:border-b-0"
                >
                  <td className="py-2 pr-4">{dateTime(row.sale_date)}</td>
                  <td className="py-2 pr-4">
                    <div>{row.subject ?? NOT_SET}</div>
                    <div className="text-ui-fg-subtle font-mono">
                      {row.supplier_article ?? row.nm_id ?? NOT_SET}
                    </div>
                  </td>
                  <td className="py-2 pr-4">{row.tech_size ?? NOT_SET}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {money(row.finished_price)}
                  </td>
                  <td
                    className={`py-2 pr-4 text-right tabular-nums ${
                      (row.for_pay ?? 0) < 0 ? "text-ui-fg-error" : ""
                    }`}
                  >
                    {money(row.for_pay)}
                  </td>
                  <td className="py-2">{row.region_name ?? row.warehouse_name ?? NOT_SET}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Text className="text-ui-fg-subtle" size="small">
          {t("wildberries.sales.empty")}
        </Text>
      )}
    </div>
  )
}
