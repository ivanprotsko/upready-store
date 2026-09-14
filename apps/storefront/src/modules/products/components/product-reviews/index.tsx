import { Heading, Text } from "@medusajs/ui"
import { getLocale, getTranslations } from "next-intl/server"

import { Link } from "@i18n/navigation"
import type { ProductReviewPage } from "@lib/data/product-reviews"
import { retrieveCustomer } from "@lib/data/customer"
import ReviewForm from "./review-form"
import StarRating from "./star-rating"

export const REVIEWS_PAGE_SIZE = 5
export const REVIEWS_PAGE_PARAM = "rp"

type ProductReviewsProps = {
  productId: string
  productHandle: string
  /** 1-based page of the review list, from the `?rp=` search parameter. */
  page: number
  /**
   * The page of reviews plus the whole product's count and average. It is
   * loaded by the template, which also shows the average next to the title and
   * puts it in the product's JSON-LD: one request, one set of numbers, so the
   * three places cannot disagree.
   */
  data: ProductReviewPage
}

/**
 * The reviews block under the product card (t09-reviews).
 *
 * A product with no published review and a visitor who is not logged in gets
 * NOTHING: no heading, no empty list, no "0 reviews". A logged-in customer
 * still gets the form on such a product, because otherwise a shop could never
 * receive its first review; the block then carries the form alone.
 *
 * The form is a `"use client"` island imported from this SERVER component, not
 * the other way round: a `"use client"` directive colours its whole import
 * graph, and this file calls `getTranslations`, `retrieveCustomer` and the
 * review loader, all of which are server-only (rule 19g).
 */
const ProductReviews = async ({
  productId,
  productHandle,
  page,
  data,
}: ProductReviewsProps) => {
  const [t, locale, customer] = await Promise.all([
    getTranslations("ProductReviews"),
    getLocale(),
    retrieveCustomer(),
  ])
  const safePage = Number.isInteger(page) && page > 0 ? page : 1
  const { reviews, count, summary } = data

  if (!count && !customer) {
    return null
  }

  const pages = Math.max(1, Math.ceil(count / REVIEWS_PAGE_SIZE))
  const formatDate = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
  const pageHref = (target: number) =>
    target <= 1
      ? `/products/${productHandle}#product-reviews`
      : `/products/${productHandle}?${REVIEWS_PAGE_PARAM}=${target}#product-reviews`

  return (
    <div
      id="product-reviews"
      className="content-container flex flex-col gap-y-6 py-10 scroll-mt-20"
      data-testid="product-reviews"
    >
      <div className="flex flex-col gap-y-2">
        <Heading level="h2" className="text-2xl-regular">
          {t("heading")}
        </Heading>
        {summary.average !== null && (
          <div className="flex items-center gap-x-2" data-testid="product-reviews-summary">
            <StarRating
              value={summary.average}
              label={t("ratingSummary", { average: summary.average, count: summary.count })}
            />
            <Text size="small" className="text-ui-fg-subtle">
              {t("ratingSummary", { average: summary.average, count: summary.count })}
            </Text>
          </div>
        )}
      </div>

      {count > 0 && (
        <ul className="flex flex-col gap-y-6" data-testid="product-reviews-list">
          {reviews.map((review) => (
            <li
              key={review.id}
              className="flex flex-col gap-y-2 border-b border-ui-border-base pb-6 last:border-b-0"
              data-testid="product-review"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <StarRating
                  value={review.rating}
                  size="small"
                  label={t("ratingValue", { value: review.rating })}
                />
                <Text className="font-medium" data-testid="product-review-author">
                  {review.author_name}
                </Text>
                <Text size="small" className="text-ui-fg-muted">
                  {formatDate.format(new Date(review.written_at))}
                </Text>
              </div>
              {review.title && <Text className="font-medium">{review.title}</Text>}
              <Text className="whitespace-pre-line">{review.body}</Text>
              {review.reply && (
                <div className="mt-2 rounded-lg bg-ui-bg-subtle px-4 py-3">
                  <Text size="small" className="font-medium">
                    {t("ownerReply")}
                  </Text>
                  <Text size="small" className="whitespace-pre-line">
                    {review.reply}
                  </Text>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="flex items-center gap-x-4" data-testid="product-reviews-pagination">
          {safePage > 1 && (
            <Link href={pageHref(safePage - 1)} className="txt-medium hover:text-ui-fg-base">
              {t("previousPage")}
            </Link>
          )}
          <Text size="small" className="text-ui-fg-subtle">
            {t("pageOf", { page: safePage, pages })}
          </Text>
          {safePage < pages && (
            <Link href={pageHref(safePage + 1)} className="txt-medium hover:text-ui-fg-base">
              {t("nextPage")}
            </Link>
          )}
        </nav>
      )}

      {customer ? (
        <ReviewForm
          productId={productId}
          defaultAuthorName={
            [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim()
          }
        />
      ) : (
        <Text size="small" className="text-ui-fg-subtle">
          {t("signInPrompt")}
        </Text>
      )}
    </div>
  )
}

export default ProductReviews
