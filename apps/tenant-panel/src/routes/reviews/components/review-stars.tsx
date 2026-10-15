import { StarSolid } from "@medusajs/icons"
import { clx } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

/**
 * Five stars, the given number lit, as the Wildberries reviews table draws a
 * rating. The stars are decoration; the label «4 из 5» is what a screen reader
 * counts.
 */
export const ReviewStars = ({ rating }: { rating: number }) => {
  const { t } = useTranslation()

  return (
    <div
      className="flex h-full items-center gap-x-0.5"
      role="img"
      aria-label={t("reviews.ratingOf", { rating })}
      title={t("reviews.ratingOf", { rating })}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <StarSolid
          key={n}
          className={clx("h-3.5 w-3.5", n <= rating ? "text-ui-tag-orange-icon" : "text-ui-fg-disabled")}
        />
      ))}
    </div>
  )
}
