import type { HttpTypes } from "@medusajs/types"

import { stripHtml } from "@lib/util/strip-html"

type DescriptionExcerptProps = {
  product: HttpTypes.StoreProduct
}

/**
 * The first three lines of the description inside the product card, under a dotted
 * divider — the bottom of the centre card in Ivan's Figma mockup. The whole text is in
 * the «Характеристики и описание» drawer, opened by the button right under it.
 *
 * The excerpt is the same stripped text the full block shows, clamped by the browser
 * (`line-clamp-3`), so it ends with an ellipsis exactly where the card's width says and
 * never on a word count guessed on the server. A product with no description renders
 * nothing, not even the divider.
 */
const DescriptionExcerpt = async ({ product }: DescriptionExcerptProps) => {
  const description = product.description ? stripHtml(product.description) : ""

  if (!description) {
    return null
  }

  return (
    <div
      className="flex flex-col gap-y-3 border-t border-dashed border-ui-border-base pt-5"
      data-testid="product-description-excerpt"
    >
      <p className="line-clamp-3 text-sm leading-6 text-ui-fg-base">
        {description}
      </p>
    </div>
  )
}

export default DescriptionExcerpt
