import type { HttpTypes } from "@medusajs/types"
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

const ProductInfo = async ({ product, reviews }: ProductInfoProps) => {
  const t = await getTranslations("ProductReviews")
  const hasReviews = !!reviews && reviews.count > 0 && reviews.average !== null

  return (
    <div id="product-info" className="flex flex-col gap-y-2">
      <h1
        className="text-[32px] font-medium leading-[160%] text-ui-fg-base"
        data-testid="product-title"
      >
        {product.title}
      </h1>
      {hasReviews && (
        <a
          href="#product-reviews"
          className="flex items-center gap-x-2"
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
    </div>
  )
}

export default ProductInfo
