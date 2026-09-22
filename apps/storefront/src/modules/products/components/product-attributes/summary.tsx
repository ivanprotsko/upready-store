import { ChevronRight } from "@medusajs/icons"
import { getTranslations } from "next-intl/server"

import type { ProductAttributeRow } from "@lib/data/product-attributes"

import { SUMMARY_ROWS, displayAttributeValue } from "./rows"

type AttributesSummaryProps = {
  rows: ProductAttributeRow[]
}

/**
 * The characteristics a buyer sees first, inside the product card: the first six rows in
 * two columns, each name joined to its value by a dotted leader, the way Ivan's Figma
 * mockup draws them («Состав ······ АСД»). A product with more rows gets a link to the
 * full table under the cards; one with six or fewer shows them all and no link.
 *
 * The leader is a flexible dotted border between the two words, not a string of full
 * stops, so it always ends exactly at the value whatever the font renders.
 */
const AttributesSummary = async ({ rows }: AttributesSummaryProps) => {
  if (!rows.length) {
    return null
  }

  const t = await getTranslations("ProductAttributes")
  const words = { yes: t("yes"), no: t("no") }
  const shown = rows.slice(0, SUMMARY_ROWS)

  return (
    <div className="flex flex-col gap-y-3" data-testid="product-attributes">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 xsmall:grid-cols-2">
        {shown.map((row) => (
          <div
            key={row.key}
            className="flex min-w-0 items-baseline gap-x-1.5 text-sm leading-6"
            data-testid={`product-attribute-summary-${row.key}`}
          >
            <dt
              className="min-w-0 shrink truncate text-ui-fg-subtle"
              title={row.name}
            >
              {row.name}
            </dt>
            <span
              aria-hidden
              className="mb-1.5 min-w-4 flex-1 border-b border-dotted border-ui-border-strong"
            />
            <dd
              className="max-w-[60%] shrink-0 truncate text-ui-fg-base"
              title={displayAttributeValue(row, words)}
            >
              {displayAttributeValue(row, words)}
            </dd>
          </div>
        ))}
      </dl>
      {rows.length > SUMMARY_ROWS && (
        <a
          href="#product-attributes"
          className="inline-flex w-fit items-center gap-x-1 text-sm font-medium text-ui-fg-base underline-offset-4 hover:underline"
          data-testid="product-attributes-link"
        >
          {t("all")}
          <ChevronRight className="pointer-events-none" />
        </a>
      )}
    </div>
  )
}

export default AttributesSummary
