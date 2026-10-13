"use server"

/**
 * Product reviews of the shop behind this storefront (t09-reviews).
 *
 * The backend answers only PUBLISHED reviews of the tenant the publishable key
 * resolves to, so nothing here can reach a neighbouring shop's rows or a review
 * waiting for moderation. `summary.average` comes back `null` for a product
 * with no reviews: there is no average of nothing, and the caller renders no
 * rating rather than a 0 or a 5.
 */

import { sdk } from "@lib/config"
import { getAuthHeaders, getCacheTag, hasSession } from "./cookies"
import { getLocale } from "./locale-actions"
import { defaultLocale } from "@i18n/config"
import { revalidateTag } from "next/cache"

const REVIEWS_TAG = "product-reviews"

export type ProductReview = {
  id: string
  product_id: string
  author_name: string
  rating: number
  title: string | null
  body: string
  language: string
  reply: string | null
  replied_at: string | null
  /**
   * When the review was written, or `null` when the shop holds no readable
   * date for it (9 of the imported reviews). The block shows no date then
   * rather than the day the review was copied into the shop.
   */
  written_at: string | null
}

export type ProductReviewSummary = {
  count: number
  average: number | null
}

export type ProductReviewPage = {
  reviews: ProductReview[]
  count: number
  summary: ProductReviewSummary
}

const EMPTY: ProductReviewPage = {
  reviews: [],
  count: 0,
  summary: { count: 0, average: null },
}

let warnedUnreachable = false

/**
 * One page of a product's reviews plus the count and the average for the whole
 * product (the summary is never a summary of the page).
 *
 * A backend that is down must not take the product page with it, so the failure
 * is logged once per server process and the page renders without the block —
 * tolerating, not hiding (rule 20a).
 */
export async function listProductReviews(
  productId: string,
  { limit = 5, offset = 0 }: { limit?: number; offset?: number } = {}
): Promise<ProductReviewPage> {
  try {
    const locale = (await getLocale()) ?? defaultLocale
    const result = await sdk.client.fetch<ProductReviewPage>(
      `/store/tenant/reviews?product_id=${encodeURIComponent(productId)}` +
        `&limit=${limit}&offset=${offset}&locale=${encodeURIComponent(locale)}`,
      {
        // A-15 (46df audit): a ceiling for a dropped revalidation webhook —
        // see the same note in products.ts.
        next: { tags: [REVIEWS_TAG], revalidate: 3600 },
        cache: "force-cache",
      }
    )
    return {
      reviews: result?.reviews ?? [],
      count: result?.count ?? 0,
      summary: result?.summary ?? { count: 0, average: null },
    }
  } catch (error) {
    if (!warnedUnreachable) {
      warnedUnreachable = true
      console.error(
        "listProductReviews: /store/tenant/reviews did not answer; the product page renders without reviews",
        error
      )
    }
    return EMPTY
  }
}

export type SubmitReviewInput = {
  product_id: string
  rating: number
  title?: string
  body: string
  author_name: string
}

export type SubmitReviewResult = { ok: true } | { ok: false; error: string }

/**
 * Sends a review as the logged-in customer. The backend refuses an anonymous
 * caller with a 401, and every review it accepts is `pending`: this action
 * cannot publish anything, and the caller must not tell the customer their
 * review is live.
 */
export async function submitProductReview(
  input: SubmitReviewInput
): Promise<SubmitReviewResult> {
  const authHeaders = await getAuthHeaders()

  if (!hasSession(authHeaders)) {
    return { ok: false, error: "unauthorized" }
  }

  try {
    const locale = (await getLocale()) ?? defaultLocale
    await sdk.client.fetch("/store/tenant/reviews", {
      method: "POST",
      headers: { ...authHeaders },
      body: {
        product_id: input.product_id,
        rating: input.rating,
        body: input.body,
        author_name: input.author_name,
        language: locale,
        ...(input.title ? { title: input.title } : {}),
      },
    })

    // The review is pending, so nothing on the page changes yet. The tag is
    // cleared anyway: the owner may publish it while this visitor is still on
    // the page, and a stale "force-cache" entry would then hide it for as long
    // as the cache lives.
    revalidateTag(REVIEWS_TAG)
    revalidateTag(await getCacheTag("products"))
    return { ok: true }
  } catch (error) {
    console.error("submitProductReview: POST /store/tenant/reviews failed", error)
    return { ok: false, error: "failed" }
  }
}
