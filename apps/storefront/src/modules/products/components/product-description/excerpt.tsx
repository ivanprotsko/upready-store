import type { HttpTypes } from "@medusajs/types"
import { ChevronRight } from "@medusajs/icons"
import { getTranslations } from "next-intl/server"

import { stripHtml } from "@lib/util/strip-html"

type DescriptionExcerptProps = {
  product: HttpTypes.StoreProduct
}

/**
 * The first three lines of the description inside the product card, under a dotted
 * divider, with a «Всё описание» link to the full text below the cards — the
 * bottom of the centre card in Ivan's Figma mockup.
 *
 * The excerpt is the same stripped text the full block shows, clamped by the browser
 * (`line-clamp-3`), so it ends with an ellipsis exactly where the card's width says and
 * never on a word count guessed on the server. A product with no description renders
 * nothing: no divider, no link to an empty anchor.
 */
const DescriptionExcerpt = async ({ product }: DescriptionExcerptProps) => {
  const description = product.description ? stripHtml(product.description) : ""

  if (!description) {
    return null
  }

  const t = await getTranslations("ProductInfo")

  return (
    <div
      className="flex flex-col gap-y-3 border-t border-dashed border-ui-border-base pt-5"
      data-testid="product-description-excerpt"
    >
      <p className="line-clamp-3 text-sm leading-6 text-ui-fg-base">
        {description}
      </p>
      <a
        href="#product-description"
        className="inline-flex w-fit items-center gap-x-1 text-sm font-medium text-ui-fg-base underline-offset-4 hover:underline"
        data-testid="product-description-link"
      >
        {t("fullDescription")}
        <ChevronRight className="pointer-events-none" />
      </a>
    </div>
  )
}

export default DescriptionExcerpt
