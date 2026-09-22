import type { HttpTypes } from "@medusajs/types"
import { getTranslations } from "next-intl/server"

import { descriptionParagraphs, stripHtml } from "@lib/util/strip-html"

type ProductDescriptionProps = {
  product: HttpTypes.StoreProduct
}

/**
 * The «Описание» block of the product page, full width under the three cards,
 * where the chrxnasdmds page puts it (`templates/product-info` there).
 *
 * It used to live inside `ProductTabs`, above the shipping accordion and
 * squeezed into the narrow right-hand column. A description is the longest
 * text on the page, so it reads at full width and carries its own heading.
 *
 * `#product-description` is the anchor the «Всё описание» link in the product
 * card jumps to (`./excerpt`). A product with no description renders nothing —
 * not an empty heading.
 */
const ProductDescription = async ({ product }: ProductDescriptionProps) => {
  const t = await getTranslations("ProductInfo")
  const description = product.description ? stripHtml(product.description) : ""

  if (!description) {
    return null
  }

  const paragraphs = descriptionParagraphs(description)

  return (
    <div
      id="product-description"
      className="scroll-mt-24 flex flex-col gap-y-4"
      data-testid="product-description-block"
    >
      <h2
        className="text-xl small:text-2xl font-medium leading-tight text-ui-fg-base"
        data-testid="product-description-heading"
      >
        {t("description")}
      </h2>
      <div
        className="flex max-w-[70ch] flex-col gap-y-4"
        data-testid="product-description"
      >
        {paragraphs.map((paragraph, position) => (
          <p
            key={position}
            className="text-base leading-7 text-ui-fg-base whitespace-pre-line"
          >
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  )
}

export default ProductDescription
