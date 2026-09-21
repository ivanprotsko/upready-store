import type { HttpTypes } from "@medusajs/types"
import { getTranslations } from "next-intl/server"

type ProductDescriptionProps = {
  product: HttpTypes.StoreProduct
}

/**
 * Strip the HTML an imported description sometimes arrives wrapped in, keeping
 * the line structure the tags carried: `<br>` and the end of a block element
 * each become a newline, and the entities a scraper leaves behind become their
 * characters. Runs of three or more newlines collapse to one blank line, so a
 * source with generous spacing does not open a hole in the page.
 */
const stripHtml = (html: string) =>
  html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

/**
 * The «Описание» block of the product page, full width under the gallery and
 * the summary, where the chrxnasdmds page puts it (`templates/product-info`
 * there).
 *
 * It used to live inside `ProductTabs`, above the shipping accordion and
 * squeezed into the narrow right-hand column. A description is the longest
 * text on the page, so it reads at full width and carries its own heading.
 *
 * `#product-description` is the anchor the chip next to the title jumps to.
 * A product with no description renders nothing — not an empty heading.
 */
const ProductDescription = async ({ product }: ProductDescriptionProps) => {
  const t = await getTranslations("ProductInfo")
  const description = product.description ? stripHtml(product.description) : ""

  if (!description) {
    return null
  }

  const paragraphs = description.split(/\n{2,}/).filter(Boolean)

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
