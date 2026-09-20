import { getTranslations } from "next-intl/server"

import { listProductAttributes } from "@lib/data/product-attributes"

/**
 * The «Характеристики» block of a product page (t15-product-attributes): the
 * shop's own characteristics of this product, in the owner's order.
 *
 * Only what the owner marked for display AND actually filled reaches this
 * component — the backend answers with nothing else — so there are no empty
 * rows and no «не указано» filler. A product with nothing filled renders
 * NOTHING, not an empty heading: a block with no rows is worse than no block.
 *
 * A server component with its own fetch, so a product page that carries no
 * characteristics costs the same as before.
 *
 * The block sits under the description, across the page, as a table in two columns
 * from 1024 (one on a phone): one hairline row per characteristic, the name on the left
 * and the value on the right. Beside the gallery it pushed the buy button off the first
 * screen for a product with a dozen characteristics. `#product-attributes` is an anchor,
 * so a link can point at it.
 */
const ProductAttributes = async ({ productId }: { productId: string }) => {
  const [rows, t] = await Promise.all([
    listProductAttributes(productId),
    getTranslations("ProductAttributes"),
  ])

  if (!rows.length) {
    return null
  }

  const displayValue = (row: (typeof rows)[number]): string => {
    if (row.type === "boolean") {
      return row.value ? t("yes") : t("no")
    }
    if (row.type === "select") {
      return row.label ?? String(row.value)
    }
    if (row.type === "number" && row.unit) {
      return `${row.value} ${row.unit}`
    }
    return String(row.value)
  }

  return (
    <div
      id="product-attributes"
      className="scroll-mt-24 w-full flex flex-col gap-y-4"
      data-testid="product-attributes"
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
            <dd className="txt-medium break-words text-ui-fg-base">{displayValue(row)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export default ProductAttributes
