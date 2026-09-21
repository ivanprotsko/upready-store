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
 * Pagination dots under the gallery's main frame, on a phone (a desktop has the
 * thumbnail rail). They are under the frame, not over it: a marketplace photo carries its
 * own caption down to the edge, and nothing is painted on a product photo.
 *
 * Up to seven photos every dot keeps its own place. From eight on the row
 * would outgrow the hero, so it becomes a window of seven centred on the
 * active slide: each dot keys on its real photo index, which lets React keep
 * the node and animate the size as the window slides instead of redrawing the
 * whole row.
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
      className="flex h-8 items-center justify-center gap-1.5 small:hidden"
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
            className={`rounded-circle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-fg-interactive transition-all duration-200 ${sizeFor(
              distance
            )} ${isActive ? "bg-ui-fg-base" : "bg-ui-fg-muted"}`}
          />
        )
      })}
    </div>
  )
}

export default GalleryDots
