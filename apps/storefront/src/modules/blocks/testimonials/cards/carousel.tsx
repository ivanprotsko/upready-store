"use client"

import { clx } from "@medusajs/ui"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"

const BUTTON_CLASS = clx(
  "inline-flex size-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-ui-fg-base transition-colors duration-150 hover:bg-[var(--muted)] disabled:cursor-default disabled:text-ui-fg-disabled disabled:hover:bg-[var(--card)] motion-reduce:transition-none",
  focusRing
)

/**
 * The edge fade of the row: an alpha mask over the side where more cards wait, none at an end. It
 * fades the cards themselves, whatever stands behind the section, and occludes nothing.
 */
const FADE = "2rem"
const edgeMask = ({ start, end }: { start: boolean; end: boolean }) =>
  start && end
    ? undefined
    : `linear-gradient(to right, ${start ? "black" : `transparent, black ${FADE}`}, ${
        end ? "black" : `black calc(100% - ${FADE}), transparent`
      })`

/**
 * The carousel of `testimonials/cards`: the server-drawn cards in one row that scrolls sideways and
 * snaps to a card (CSS scroll-snap, no library), after the storefront's own strip
 * (`modules/products/components/product-row`). A swipe, a trackpad or the arrow keys on the focused
 * row move it; the two buttons under it move it by one card and go dim at either end, and the side
 * with more cards fades out (`edgeMask`). When every card fits, there is nothing to move: no fade and
 * no buttons. The focus ring sits inside the row, where the mask does not cut it.
 *
 * The only client part of the block: it keeps where the row stands, nothing else.
 */
export default function TestimonialsCarousel({
  label,
  previousLabel,
  nextLabel,
  children,
}: {
  label: string
  previousLabel: string
  nextLabel: string
  children: ReactNode
}) {
  const row = useRef<HTMLUListElement>(null)
  const [edges, setEdges] = useState({ start: true, end: false })

  const measure = useCallback(() => {
    const el = row.current
    if (!el) return
    const start = el.scrollLeft <= 1
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
    setEdges((now) => (now.start === start && now.end === end ? now : { start, end }))
  }, [])

  useEffect(() => {
    const el = row.current
    if (!el) return
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [measure])

  const move = (direction: -1 | 1) => {
    const el = row.current
    const card = el?.firstElementChild as HTMLElement | null
    if (!el || !card) return
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    el.scrollBy({ left: direction * (card.offsetWidth + gap), behavior: still ? "auto" : "smooth" })
  }

  const fits = edges.start && edges.end
  const mask = edgeMask(edges)

  return (
    <div className="flex flex-col gap-4">
      <ul
        ref={row}
        onScroll={measure}
        tabIndex={0}
        aria-label={label}
        style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
        className={clx(
          "flex snap-x snap-mandatory gap-4 overflow-x-auto rounded-[var(--radius)] no-scrollbar small:gap-6",
          focusRing,
          "focus-visible:outline-offset-[-2px]"
        )}
      >
        {children}
      </ul>
      {fits ? null : (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            data-role="trigger"
            aria-label={previousLabel}
            disabled={edges.start}
            onClick={() => move(-1)}
            className={BUTTON_CLASS}
          >
            <ChevronLeft aria-hidden="true" focusable="false" strokeWidth={1.75} className="size-5" />
          </button>
          <button
            type="button"
            data-role="trigger"
            aria-label={nextLabel}
            disabled={edges.end}
            onClick={() => move(1)}
            className={BUTTON_CLASS}
          >
            <ChevronRight aria-hidden="true" focusable="false" strokeWidth={1.75} className="size-5" />
          </button>
        </div>
      )}
    </div>
  )
}
