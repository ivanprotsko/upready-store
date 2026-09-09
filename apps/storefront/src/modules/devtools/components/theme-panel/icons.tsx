/**
 * Monochrome icons for the devtools panel: inline SVG, stroke 1.5, currentColor, 15–16 px
 * — the canon's icon rule. They live here rather than in a shared module because nothing
 * outside this panel uses them, and the panel must not depend on the shop's icon set.
 */

export function SlidersIcon() {
  return (
    <svg className="updev-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  )
}

export function CheckIcon() {
  return (
    <svg className="updev-check" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 13 4 4L19 7" />
    </svg>
  )
}

export function CloseIcon() {
  return (
    <svg className="updev-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

/** Row-open/closed marker for the composition rows. */
export function ChevronIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      className="updev-icon updev-chevron"
      viewBox="0 0 24 24"
      aria-hidden="true"
      data-direction={direction}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

/** The "forbidden option" marker (T2's ⊘) — a circle with a slash, never a glyph. */
export function BanIcon() {
  return (
    <svg className="updev-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="m7 7 10 10" />
    </svg>
  )
}
