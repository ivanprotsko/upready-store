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
    <div className="w-full py-3 border-b" data-testid="product-attributes">
      <h2 className="txt-large text-ui-fg-subtle mb-2">{t("title")}</h2>
      <dl className="flex flex-col gap-y-1">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex items-baseline justify-between gap-x-4"
            data-testid={`product-attribute-${row.key}`}
          >
            <dt className="txt-medium text-ui-fg-subtle">{row.name}</dt>
            <dd className="txt-medium text-ui-fg-base text-end">
              {displayValue(row)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export default ProductAttributes
