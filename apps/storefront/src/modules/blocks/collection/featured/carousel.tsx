"use client"

import { clx } from "@medusajs/ui"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useEffect, useId, useRef, useState, type ReactNode } from "react"

const ARROW_CLASS =
  "inline-flex size-11 items-center justify-center rounded-[var(--radius)] border border-ui-border-base text-ui-fg-base transition-colors hover:bg-ui-bg-base-hover disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"

/**
 * One row on the grid's gaps that scrolls and snaps to a card's start, its scrollbar hidden.
 * The row stands 0.5rem out on every side, inside the container's own padding, so a card's
 * focus ring is not clipped by the scroller; `scroll-px-2` snaps to the container's edge.
 */
const TRACK_CLASS =
  "-mx-2 -my-2 flex snap-x snap-mandatory scroll-px-2 gap-x-3 overflow-x-auto px-2 py-2 small:gap-x-6 no-scrollbar"

/**
 * Below 1024 px the row shows the edge of the next card; the last 2rem of the row fade out, so
 * that edge reads as more to come, not as a card cut off. Off at the end of the row and from
 * 1024 px, where whole cards fill the row and the arrows say the rest. The mask is alpha only,
 * so its colour is no theme colour; the side follows the page's direction.
 */
const EDGE_FADE =
  "max-small:[mask-image:linear-gradient(to_var(--fade-side,right),black_calc(100%-2rem),transparent)] rtl:[--fade-side:left]"

/**
 * The carousel of `collection/featured`: the server's cards in one row that scrolls, plus
 * two arrows from 1024 px. The row is plain CSS scroll snapping, so a phone swipes it with
 * no script at all; the script only pages the row by its own width and switches an arrow
 * off at either end. `overflows` is the server's guess (more cards than `columns`), so the
 * arrows stand in the first paint and nothing below them moves.
 */
export default function FeaturedCarousel({
  children,
  className,
  overflows,
  previousLabel,
  nextLabel,
}: {
  children: ReactNode
  className: string
  overflows: boolean
  previousLabel: string
  nextLabel: string
}) {
  const track = useRef<HTMLUListElement>(null)
  const id = useId()
  const [edges, setEdges] = useState({ start: true, end: !overflows })

  useEffect(() => {
    const element = track.current
    if (!element) return
    // `scrollLeft` runs from 0 to negative in a right-to-left page; its size is the offset either way.
    const update = () => {
      const offset = Math.abs(element.scrollLeft)
      setEdges({ start: offset <= 1, end: offset + element.clientWidth >= element.scrollWidth - 1 })
    }
    update()
    element.addEventListener("scroll", update, { passive: true })
    const resize = new ResizeObserver(update)
    resize.observe(element)
    return () => {
      element.removeEventListener("scroll", update)
      resize.disconnect()
    }
  }, [])

  const page = (step: 1 | -1) => {
    const element = track.current
    if (!element) return
    const rtl = getComputedStyle(element).direction === "rtl"
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    element.scrollBy({ left: step * (rtl ? -1 : 1) * element.clientWidth, behavior: still ? "auto" : "smooth" })
  }

  return (
    <div>
      <ul ref={track} id={id} className={clx(TRACK_CLASS, className, !edges.end && EDGE_FADE)} data-carousel-track="">
        {children}
      </ul>
      {edges.start && edges.end ? null : (
        <div className="mt-[var(--layer-space-4,1rem)] hidden justify-end gap-2 small:flex">
          <button
            type="button"
            aria-label={previousLabel}
            aria-controls={id}
            disabled={edges.start}
            onClick={() => page(-1)}
            className={ARROW_CLASS}
          >
            <ChevronLeft aria-hidden className="size-5 rtl:-scale-x-100" />
          </button>
          <button
            type="button"
            aria-label={nextLabel}
            aria-controls={id}
            disabled={edges.end}
            onClick={() => page(1)}
            className={ARROW_CLASS}
          >
            <ChevronRight aria-hidden className="size-5 rtl:-scale-x-100" />
          </button>
        </div>
      )}
    </div>
  )
}
