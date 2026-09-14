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
 *
 * The two colours are `fg-base` and `fg-disabled`, not the `tag-orange` pair a
 * star usually gets: a tenant's theme preset overrides the chart palette those
 * tag tokens are built on, and on this shop's own preset
 * `--tag-orange-icon` resolves to a pale mint (`#d7e3de`, measured on the
 * stand 2026-09-15) LIGHTER than the muted grey of the empty stars — the
 * rating read as five empty stars whatever the score. `fg-base` and
 * `fg-disabled` are theme-aware and always on opposite ends of the contrast
 * range, so the filled half is visible on every preset and in both modes.
 */
const StarRating = ({ value, size = "base", label }: StarRatingProps) => {
  const filled = Math.round(value)
  const dimension = size === "small" ? "h-3.5 w-3.5" : "h-4 w-4"

  return (
    <span
      className="inline-flex items-center gap-x-0.5 text-ui-fg-base"
      role="img"
      aria-label={label}
    >
      {[1, 2, 3, 4, 5].map((position) =>
        position <= filled ? (
          <StarSolid key={position} className={dimension} aria-hidden />
        ) : (
          <Star key={position} className={`${dimension} text-ui-fg-disabled`} aria-hidden />
        )
      )}
    </span>
  )
}

export default StarRating
