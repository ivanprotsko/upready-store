import type { HttpTypes } from "@medusajs/types"
import { ChevronRight, StarSolid } from "@medusajs/icons"
import { getFormatter, getTranslations } from "next-intl/server"

import type { ProductReviewSummary } from "@lib/data/product-reviews"

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
 * The head of the centre card: the title, the subtitle when there is one, and the
 * rating as one outlined pill («★ 4,8 · 3 отзыва ›») that scrolls to the reviews —
 * the top of the centre card in Ivan's Figma mockup. The mockup's second pill, the
 * questions count, has no source on this storefront and is not drawn.
 *
 * The link to the description moved to the bottom of the card («Всё описание»,
 * `product-description/excerpt`), under the three-line excerpt it continues.
 */
const ProductInfo = async ({ product, reviews }: ProductInfoProps) => {
  const [t, format] = await Promise.all([getTranslations("ProductReviews"), getFormatter()])
  const hasReviews = !!reviews && reviews.count > 0 && reviews.average !== null

  return (
    <div id="product-info" className="flex flex-col gap-y-4">
      <div className="flex flex-col gap-y-2">
        <h1
          className="text-2xl small:text-[28px] font-medium leading-tight text-ui-fg-base"
          data-testid="product-title"
        >
          {product.title}
        </h1>
        {product.subtitle && (
          <p className="text-sm leading-6 text-ui-fg-subtle">{product.subtitle}</p>
        )}
      </div>
      {hasReviews && (
        <a
          href="#product-reviews"
          className="inline-flex w-fit max-w-full items-center gap-x-2 rounded-full border border-ui-border-base px-3 py-1.5 text-sm leading-5 text-ui-fg-base transition-colors hover:border-ui-border-strong"
          aria-label={t("ratingSummary", {
            average: reviews.average as number,
            count: reviews.count,
          })}
          data-testid="product-rating"
        >
          <StarSolid className="h-4 w-4 shrink-0" aria-hidden />
          <span className="font-medium tabular-nums">
            {format.number(reviews.average as number, { maximumFractionDigits: 1 })}
          </span>
          <span className="truncate text-ui-fg-subtle">
            {t("reviewCount", { count: reviews.count })}
          </span>
          <ChevronRight className="shrink-0 text-ui-fg-muted" aria-hidden />
        </a>
      )}
    </div>
  )
}

export default ProductInfo
