"use client"

import { wrapIndex } from "./items"

type GalleryDotsProps = {
  total: number
  index: number
  /** Accessible name of the dot that jumps to `position` (0-based). */
  label: (position: number) => string
  onSelect: (position: number) => void
}

/**
 * Pagination dots over the gallery's hero image, as on the chrxnasdmds product
 * page.
 *
 * Up to seven photos every dot keeps its own place. From eight on the row
 * would outgrow the hero, so it becomes a window of seven centred on the
 * active slide: each dot keys on its real photo index, which lets React keep
 * the node and animate the size as the window slides instead of redrawing the
 * whole row.
 *
 * The row itself takes no pointer events, or the gaps between dots would eat
 * the hero's own click (which opens the full-screen viewer); each dot takes
 * them back.
 */
const GalleryDots = ({ total, index, label, onSelect }: GalleryDotsProps) => {
  const sizeFor = (distance: number) => {
    if (distance === 0) {
      return "w-5 h-1.5"
    }
    if (distance === 1) {
      return "w-1.5 h-1.5"
    }
    if (distance === 2) {
      return "w-1 h-1"
    }
    return "w-0.5 h-0.5"
  }

  const positions =
    total <= 7
      ? Array.from({ length: total }, (_, position) => position)
      : [-3, -2, -1, 0, 1, 2, 3].map((offset) =>
          wrapIndex(index, offset, total)
        )

  return (
    <div
      className="pointer-events-none absolute bottom-3 left-0 right-0 flex items-center justify-center gap-1.5"
      data-testid="product-gallery-dots"
    >
      {positions.map((position) => {
        const isActive = position === index
        const straight = Math.abs(position - index)
        const distance =
          total <= 7 ? straight : Math.min(straight, total - straight)
        return (
          <button
            key={position}
            type="button"
            aria-label={label(position)}
            aria-current={isActive ? "true" : undefined}
            onClick={(event) => {
              event.stopPropagation()
              onSelect(position)
            }}
            className={`pointer-events-auto rounded-circle transition-all duration-200 ${sizeFor(
              distance
            )} ${isActive ? "bg-ui-fg-base" : "bg-ui-fg-muted"}`}
          />
        )
      })}
    </div>
  )
}

export default GalleryDots
