import { Star, StarSolid } from "@medusajs/icons"

type StarRatingProps = {
  /** 1 to 5. A half star is not drawn: the value is rounded to the nearest whole. */
  value: number
  size?: "small" | "base"
  /** Read by assistive technology in place of the five icons. */
  label: string
}

/**
 * Five stars, filled up to `value`. The icons are decorative and the number is
 * carried by `aria-label` on the group, so a screen reader hears "4.3 out of 5"
 * once instead of the word "star" five times.
 */
const StarRating = ({ value, size = "base", label }: StarRatingProps) => {
  const filled = Math.round(value)
  const dimension = size === "small" ? "h-3.5 w-3.5" : "h-4 w-4"

  return (
    <span
      className="inline-flex items-center gap-x-0.5 text-ui-tag-orange-icon"
      role="img"
      aria-label={label}
    >
      {[1, 2, 3, 4, 5].map((position) =>
        position <= filled ? (
          <StarSolid key={position} className={dimension} aria-hidden />
        ) : (
          <Star key={position} className={`${dimension} text-ui-fg-muted`} aria-hidden />
        )
      )}
    </span>
  )
}

export default StarRating
