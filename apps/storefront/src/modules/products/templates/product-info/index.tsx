import type { HttpTypes } from "@medusajs/types"
import { ChevronRight } from "@medusajs/icons"
import { Text } from "@medusajs/ui"
import { getTranslations } from "next-intl/server"

import type { ProductReviewSummary } from "@lib/data/product-reviews"
import StarRating from "@modules/products/components/product-reviews/star-rating"

type ProductInfoProps = {
  product: HttpTypes.StoreProduct
  /**
   * The product's reviews, when it has any. `average` is `null` for a product
   * with none, and nothing is drawn then: no stars, no "0 reviews", no rating
   * rounded up out of an empty set (rule 20a).
   */
  reviews?: ProductReviewSummary
}

/**
 * The head of the product page, beside the gallery: title, rating, and a link
 * down to the description.
 *
 * Structure taken from the chrxnasdmds `product-info-summary` — the title
 * first, the rating right under it as one clickable line that scrolls to the
 * reviews, and a chip that jumps to the description further down the page.
 * The chip is what makes a long description reachable without scrolling past
 * the whole card, and it renders only when there is a description to reach.
 */
const ProductInfo = async ({ product, reviews }: ProductInfoProps) => {
  const [t, tInfo] = await Promise.all([
    getTranslations("ProductReviews"),
    getTranslations("ProductInfo"),
  ])
  const hasReviews = !!reviews && reviews.count > 0 && reviews.average !== null
  const hasDescription = Boolean(product.description?.trim())

  return (
    <div id="product-info" className="flex flex-col gap-y-3">
      <h1
        className="text-[28px] small:text-[32px] font-medium leading-tight text-ui-fg-base"
        data-testid="product-title"
      >
        {product.title}
      </h1>
      {hasReviews && (
        <a
          href="#product-reviews"
          className="flex w-fit items-center gap-x-2"
          data-testid="product-rating"
        >
          <StarRating
            value={reviews.average as number}
            size="small"
            label={t("ratingSummary", {
              average: reviews.average as number,
              count: reviews.count,
            })}
          />
          <Text size="small" className="text-ui-fg-subtle">
            {t("ratingSummary", {
              average: reviews.average as number,
              count: reviews.count,
            })}
          </Text>
        </a>
      )}
      {product.subtitle && (
        <p className="txt-medium text-ui-fg-subtle">{product.subtitle}</p>
      )}
      {hasDescription && (
        <a
          href="#product-description"
          className="inline-flex w-fit items-center gap-x-1 rounded-circle border border-ui-border-base px-3 py-1 txt-compact-small text-ui-fg-subtle transition-colors hover:border-ui-border-strong hover:text-ui-fg-base"
          data-testid="product-description-link"
        >
          {tInfo("description")}
          <ChevronRight className="pointer-events-none" />
        </a>
      )}
    </div>
  )
}

export default ProductInfo
