"use client"

import { useState } from "react"
import { Star, StarSolid } from "@medusajs/icons"
import { Button, Input, Label, Text, Textarea } from "@medusajs/ui"
import { useTranslations } from "next-intl"

import { submitProductReview } from "@lib/data/product-reviews"

type ReviewFormProps = {
  productId: string
  defaultAuthorName: string
}

/**
 * The form a logged-in customer leaves a review with. The review it sends is
 * `pending` and the confirmation says so: telling the customer it is live would
 * be a claim about a page it is not on yet.
 *
 * The rating starts UNSET rather than at five, so an untouched form cannot send
 * a rating nobody chose (rule 20a: a value substituted for an absence).
 *
 * Each of the five buttons draws ONE star, filled up to the chosen rating. It
 * used to draw a whole `StarRating`, which is a row of five by itself, so the
 * field showed 25 stars (ask da22). The two colours are the ones `StarRating`
 * explains: `fg-base` and `fg-disabled` hold on every theme preset.
 */
const ReviewForm = ({ productId, defaultAuthorName }: ReviewFormProps) => {
  const t = useTranslations("ProductReviews")
  const [rating, setRating] = useState<number | null>(null)
  const [authorName, setAuthorName] = useState(defaultAuthorName)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle")

  if (state === "sent") {
    return (
      <div
        className="rounded-lg border border-ui-border-base bg-ui-bg-subtle px-4 py-4"
        data-testid="review-pending-notice"
      >
        <Text size="small">{t("pendingNotice")}</Text>
      </div>
    )
  }

  const ready = rating !== null && authorName.trim().length > 0 && body.trim().length > 0

  return (
    <form
      className="flex flex-col gap-y-4 rounded-lg border border-ui-border-base px-4 py-4"
      data-testid="review-form"
      onSubmit={async (event) => {
        event.preventDefault()
        if (!ready || state === "sending") return
        setState("sending")
        const result = await submitProductReview({
          product_id: productId,
          rating: rating as number,
          title: title.trim() || undefined,
          body: body.trim(),
          author_name: authorName.trim(),
        })
        setState(result.ok ? "sent" : "error")
      }}
    >
      <Text className="font-medium">{t("formHeading")}</Text>

      <div className="flex flex-col gap-y-2">
        <Label size="small">{t("ratingLabel")}</Label>
        <div className="flex items-center gap-x-1">
          {[1, 2, 3, 4, 5].map((value) => {
            const filled = rating !== null && value <= rating
            return (
              <button
                key={value}
                type="button"
                className="rounded p-1 text-ui-fg-base hover:bg-ui-bg-subtle-hover"
                aria-label={t("ratingValue", { value })}
                aria-pressed={rating === value}
                onClick={() => setRating(value)}
                data-testid={`review-rating-${value}`}
              >
                {filled ? (
                  <StarSolid className="h-5 w-5" aria-hidden />
                ) : (
                  <Star className="h-5 w-5 text-ui-fg-disabled" aria-hidden />
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-y-2">
        <Label size="small" htmlFor="review-author">
          {t("nameLabel")}
        </Label>
        <Input
          id="review-author"
          value={authorName}
          maxLength={120}
          onChange={(event) => setAuthorName(event.target.value)}
          data-testid="review-author-input"
        />
      </div>

      <div className="flex flex-col gap-y-2">
        <Label size="small" htmlFor="review-title">
          {t("titleLabel")}
        </Label>
        <Input
          id="review-title"
          value={title}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
          data-testid="review-title-input"
        />
      </div>

      <div className="flex flex-col gap-y-2">
        <Label size="small" htmlFor="review-body">
          {t("bodyLabel")}
        </Label>
        <Textarea
          id="review-body"
          rows={4}
          value={body}
          maxLength={5000}
          onChange={(event) => setBody(event.target.value)}
          data-testid="review-body-input"
        />
      </div>

      {state === "error" && (
        <Text size="small" className="text-ui-fg-error" data-testid="review-error">
          {t("error")}
        </Text>
      )}

      <Button
        type="submit"
        variant="primary"
        disabled={!ready}
        isLoading={state === "sending"}
        data-testid="review-submit"
      >
        {t("submit")}
      </Button>
    </form>
  )
}

export default ReviewForm
