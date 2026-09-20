import { Badge, Text, Tooltip } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import type { WbDiffKind, WbDiffRow } from "../../../../hooks/api/wb-write-preview"

/**
 * The «что изменится на WB» table itself (w21-wb-write-stocks-prices).
 *
 * One row per (product, warehouse) for stocks and per product for prices, with
 * the shop's number and WB's number side by side. A `skipped` row carries the
 * REASON in plain language rather than disappearing: "we could not tell" and
 * "nothing to change" must never read the same (rule 20a).
 *
 * Design system: @medusajs/ui, like the rest of this page — the divergence
 * from the Geist canon is the one recorded in w01's report, not a new one.
 */

const NOT_SET = "—"

const formatNumber = (value: number | null | undefined, locale: string): string =>
  value === null || value === undefined
    ? NOT_SET
    : new Intl.NumberFormat(locale).format(value)

const actionColor = (action: WbDiffRow["action"]): "green" | "orange" | "grey" =>
  action === "update" ? "orange" : action === "equal" ? "green" : "grey"

export const WbDiffTable = ({
  kind,
  rows,
  locale,
}: {
  kind: WbDiffKind
  rows: WbDiffRow[]
  locale: string
}) => {
  const { t } = useTranslation()

  if (!rows.length) {
    return (
      <Text size="small" className="text-ui-fg-subtle">
        {t("wildberries.preview.empty")}
      </Text>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="txt-compact-small w-full min-w-[820px] text-left">
        <thead className="text-ui-fg-subtle">
          <tr className="border-ui-border-base border-b">
            <th className="py-2 pr-4 font-normal">{t("wildberries.preview.product")}</th>
            <th className="py-2 pr-4 font-normal">
              {kind === "stocks"
                ? t("wildberries.preview.barcode")
                : t("wildberries.preview.nmId")}
            </th>
            <th className="py-2 pr-4 text-right font-normal">
              {t("wildberries.preview.store")}
            </th>
            <th className="py-2 pr-4 text-right font-normal">{t("wildberries.preview.wb")}</th>
            {kind === "prices" ? (
              <th className="py-2 pr-4 text-right font-normal">
                {t("wildberries.preview.proposed")}
              </th>
            ) : null}
            <th className="py-2 font-normal">{t("wildberries.preview.action")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.variant_id}:${row.warehouse_id ?? "-"}`}
              className="border-ui-border-base border-b last:border-b-0"
            >
              <td className="py-2 pr-4">
                <span className="block">{row.product_title}</span>
                <span className="text-ui-fg-subtle block font-mono">
                  {row.variant_sku ?? row.variant_id}
                </span>
              </td>
              <td className="py-2 pr-4 font-mono">
                {kind === "stocks" ? (row.barcode ?? NOT_SET) : row.nm_id}
              </td>
              <td className="py-2 pr-4 text-right font-mono">
                {formatNumber(row.store_value, locale)}
              </td>
              <td className="py-2 pr-4 text-right font-mono">
                {formatNumber(row.wb_value, locale)}
              </td>
              {kind === "prices" ? (
                <td className="py-2 pr-4 text-right font-mono">
                  {row.proposed_price === null || row.proposed_price === undefined ? (
                    NOT_SET
                  ) : (
                    <Tooltip
                      content={t("wildberries.preview.proposedHint", {
                        discount: row.wb_discount ?? 0,
                        price: formatNumber(row.wb_price, locale),
                      })}
                    >
                      <span>{formatNumber(row.proposed_price, locale)}</span>
                    </Tooltip>
                  )}
                </td>
              ) : null}
              <td className="py-2">
                <Badge size="2xsmall" color={actionColor(row.action)}>
                  {t(`wildberries.preview.actions.${row.action}`)}
                </Badge>
                {row.reason ? (
                  <Text size="small" className="text-ui-fg-subtle">
                    {t(`wildberries.preview.reasons.${row.reason}`, {
                      defaultValue: row.reason,
                    })}
                  </Text>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
