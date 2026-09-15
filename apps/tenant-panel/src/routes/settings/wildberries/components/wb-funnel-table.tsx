import { Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import type { WbTablesResponse } from "../../../../hooks/api/wb-tables"

const NOT_SET = "—"

/**
 * The sales funnel of each listing over the week WB keeps
 * (w03-wb-sales-questions-mirror).
 *
 * The columns are WB's own funnel, in its order: card opened, added to cart,
 * ordered, bought out. The header says which days the numbers cover and how
 * many listings are in the table, because WB's method takes at most 20
 * listing numbers per request and a base token gets two requests an hour —
 * so a table of 20 rows in a shop with 423 listings is the normal case, not a
 * bug, and the screen has to say so instead of looking complete.
 */
export const WbFunnelTable = ({
  analytics,
  listingsTotal,
}: {
  analytics: WbTablesResponse["analytics"]
  listingsTotal: number | null
}) => {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || "ru"

  const count = (value: number | null): string =>
    value === null ? NOT_SET : value.toLocaleString(locale)

  return (
    <div className="flex flex-col gap-y-3">
      <Text className="text-ui-fg-subtle" size="small">
        {analytics.period_start && analytics.period_end
          ? t("wildberries.funnel.window", {
              from: analytics.period_start,
              to: analytics.period_end,
              listings: analytics.listings,
              total: listingsTotal ?? analytics.listings,
            })
          : t("wildberries.funnel.noWindow")}
      </Text>

      {analytics.rows.length ? (
        <div className="overflow-x-auto">
          <table className="txt-compact-small w-full min-w-[720px] text-left">
            <thead className="text-ui-fg-subtle">
              <tr className="border-ui-border-base border-b">
                <th className="py-2 pr-4 font-normal">{t("wildberries.funnel.item")}</th>
                <th className="py-2 pr-4 text-right font-normal">
                  {t("wildberries.funnel.openCard")}
                </th>
                <th className="py-2 pr-4 text-right font-normal">
                  {t("wildberries.funnel.addToCart")}
                </th>
                <th className="py-2 pr-4 text-right font-normal">
                  {t("wildberries.funnel.orders")}
                </th>
                <th className="py-2 pr-4 text-right font-normal">
                  {t("wildberries.funnel.orderedSum")}
                </th>
                <th className="py-2 text-right font-normal">{t("wildberries.funnel.buyouts")}</th>
              </tr>
            </thead>
            <tbody>
              {analytics.rows.map((row) => (
                <tr key={row.nm_id} className="border-ui-border-base border-b last:border-b-0">
                  <td className="py-2 pr-4">
                    <div>{row.title ?? NOT_SET}</div>
                    <div className="text-ui-fg-subtle font-mono">
                      {row.vendor_code ?? row.nm_id}
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{count(row.open_card)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{count(row.add_to_cart)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{count(row.orders)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {row.ordered_sum.toLocaleString(locale, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-2 text-right tabular-nums">{count(row.buyouts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Text className="text-ui-fg-subtle" size="small">
          {t("wildberries.funnel.empty")}
        </Text>
      )}
    </div>
  )
}
