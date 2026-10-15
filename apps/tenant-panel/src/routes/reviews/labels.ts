import type { TFunction } from "i18next"

import type { ReviewSource, ReviewStatus } from "../../hooks/api/reviews"

// Plain-language labels for the raw enums the backend stores (rule 18e: a raw
// enum reaches the screen only through a label map). t-2026-10-14-01 (G5):
// every word is a `reviews.*` key in ru.json / en.json.

export const REVIEW_STATUS_COLOR: Record<ReviewStatus, "orange" | "green" | "grey"> = {
  pending: "orange",
  published: "green",
  hidden: "grey",
}

export const reviewStatusLabel = (t: TFunction, status: ReviewStatus): string =>
  t(`reviews.status.${status}`)

/** What the status means for the storefront, on hover of the badge. */
export const reviewStatusHint = (t: TFunction, status: ReviewStatus): string =>
  t(`reviews.statusHint.${status}`)

export const reviewSourceLabel = (t: TFunction, source: ReviewSource): string =>
  t(`reviews.source.${source}`)

const KNOWN_LANGUAGES = ["ru", "en", "de", "fr", "es", "it", "uk"]

/** «русский» where the panel knows the tag, the tag itself otherwise. */
export const reviewLanguageLabel = (t: TFunction, tag: string): string => {
  const code = tag.toLowerCase()
  return KNOWN_LANGUAGES.includes(code) ? t(`reviews.language.${code}`) : tag
}

/** «с витрины · русский»: where the review came from and its language. */
export const reviewOrigin = (t: TFunction, source: ReviewSource, language: string): string =>
  t("reviews.origin", {
    source: reviewSourceLabel(t, source),
    language: reviewLanguageLabel(t, language),
  })

/**
 * The status moves a review offers: a pending one can only be published; a
 * published one hidden or sent back to the queue; a hidden one published again
 * or sent back. «Скрыть» on a review the storefront never showed means nothing.
 */
export const statusMoves = (status: ReviewStatus): ReviewStatus[] =>
  status === "pending"
    ? ["published"]
    : status === "published"
      ? ["hidden", "pending"]
      : ["published", "pending"]

export const REPLY_MAX_LENGTH = 5000
