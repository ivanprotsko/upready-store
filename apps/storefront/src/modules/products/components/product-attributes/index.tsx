import { getTranslations } from "next-intl/server"

import type { ProductAttributeRow } from "@lib/data/product-attributes"

import { displayAttributeValue } from "./rows"

/**
 * The «Характеристики» block of a product page (t15-product-attributes): the
 * shop's own characteristics of this product, in the owner's order, as a table.
 *
 * Only what the owner marked for display AND actually filled reaches this
 * component — the backend answers with nothing else — so there are no empty
 * rows and no «не указано» filler. A product with nothing filled renders
 * NOTHING, not an empty heading: a block with no rows is worse than no block.
 *
 * The rows come prepared from the template (`./rows`), which fetches them once and
 * also hands the first six to the summary inside the product card (`./summary`).
 *
 * The block sits under the three cards, across the page, as a table in two columns
 * from 1024 (one on a phone): one hairline row per characteristic, the name on the left
 * and the value on the right. `#product-attributes` is the anchor the card's «all
 * characteristics» link points at.
 */
type ProductAttributesProps = {
  rows: ProductAttributeRow[]
}

const ProductAttributes = async ({ rows }: ProductAttributesProps) => {
  if (!rows.length) {
    return null
  }

  const t = await getTranslations("ProductAttributes")
  const words = { yes: t("yes"), no: t("no") }

  return (
    <div
      id="product-attributes"
      className="scroll-mt-24 w-full flex flex-col gap-y-4"
      data-testid="product-attributes-table"
    >
      <h2 className="text-xl small:text-2xl font-medium leading-tight text-ui-fg-base">
        {t("title")}
      </h2>
      <dl className="grid grid-cols-1 gap-x-12 small:grid-cols-2">
        {rows.map((row) => (
          <div
            key={row.key}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-x-4 border-b border-ui-border-base py-2.5"
            data-testid={`product-attribute-${row.key}`}
          >
            <dt className="txt-medium text-ui-fg-subtle">{row.name}</dt>
            <dd className="txt-medium break-words text-ui-fg-base">
              {displayAttributeValue(row, words)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export default ProductAttributes
