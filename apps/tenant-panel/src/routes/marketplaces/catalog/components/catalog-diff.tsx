import { Text, Tooltip } from "@medusajs/ui"

import type { CatalogDifference } from "../../../../hooks/api/marketplace-catalog"

/**
 * One comparison between the shop and a marketplace (w14-mp-catalog-link).
 *
 * Rule 18e in one cell: the number carries its unit, and the hint says where
 * both halves came from. A cell with nothing to compare says «нет данных» and
 * never «0» — a zero price and an unknown price are different facts, and
 * substituting one for the other is exactly the defect rule 20a is about.
 */

const NOT_SET = "—"

const format = (value: number | null, unit: string): string => {
  if (value === null) {
    return NOT_SET
  }
  const shown = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value)
  return unit ? `${shown} ${unit}` : shown
}

const signed = (value: number, unit: string): string => {
  const shown = new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
    signDisplay: "exceptZero",
  }).format(value)
  return unit ? `${shown} ${unit}` : shown
}

export const CatalogDiffCell = ({ difference }: { difference: CatalogDifference }) => {
  const both = difference.shop !== null && difference.marketplace !== null

  return (
    <Tooltip content={difference.note}>
      <div className="flex flex-col gap-y-0.5">
        <Text size="small" className="tabular-nums">
          {format(difference.shop, difference.unit)}
          <span className="text-ui-fg-muted"> / </span>
          {format(difference.marketplace, difference.unit)}
        </Text>
        {both && difference.abs !== null ? (
          <Text
            size="xsmall"
            className={
              difference.highlighted
                ? "text-ui-fg-error tabular-nums"
                : "text-ui-fg-subtle tabular-nums"
            }
          >
            {signed(difference.abs, difference.unit)}
            {difference.pct !== null ? ` (${signed(difference.pct, "%")})` : ""}
          </Text>
        ) : (
          <Text size="xsmall" className="text-ui-fg-muted">
            нет данных для сравнения
          </Text>
        )}
      </div>
    </Tooltip>
  )
}
