"use client"

import { ChevronLeft, ChevronRight } from "@medusajs/icons"
import { clx } from "@medusajs/ui"
import { useEffect, useId, useRef, useState, type ReactNode } from "react"

import SectionHeader from "@modules/journal/components/section-header"
import { ARROW_CLASS } from "@modules/journal/typography"

/**
 * The scrolling part of a rubric rail (t-2026-10-05-03), after the chrxnasdmds category
 * rail: the section header with two round arrows, and a native scroll-snap row of cards
 * inside the page's container. An arrow moves the row by one card; an arrow with nowhere to
 * go is switched off, and both are hidden while every card fits.
 */
export default function CategoryRailTrack({
  title,
  headingId,
  labels,
  children,
}: {
  title: string
  headingId: string
  labels: { previous: string; next: string }
  children: ReactNode
}) {
  const ref = useRef<HTMLUListElement>(null)
  const trackId = useId()
  const [arrows, setArrows] = useState({ previous: false, next: false })

  useEffect(() => {
    const ul = ref.current
    if (!ul) return
    const measure = () => {
      const max = ul.scrollWidth - ul.clientWidth
      const at = Math.abs(ul.scrollLeft)
      const now = { previous: at > 1, next: at < max - 1 }
      setArrows((was) => (was.previous === now.previous && was.next === now.next ? was : now))
    }
    measure()
    ul.addEventListener("scroll", measure, { passive: true })
    const observer = new ResizeObserver(measure)
    observer.observe(ul)
    return () => {
      ul.removeEventListener("scroll", measure)
      observer.disconnect()
    }
  }, [])

  const step = (dir: 1 | -1) => {
    const ul = ref.current
    if (!ul) return
    const [a, b] = Array.from(ul.children) as HTMLElement[]
    if (!a) return
    const pitch = b ? Math.abs(b.offsetLeft - a.offsetLeft) : a.offsetWidth
    const rtl = getComputedStyle(ul).direction === "rtl"
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ul.scrollBy({ left: dir * (rtl ? -pitch : pitch), behavior: still ? "instant" : "smooth" })
  }

  return (
    <div className="flex flex-col gap-6 small:gap-8">
      <SectionHeader id={headingId} title={title}>
        <div
          className={clx(
            "flex shrink-0 items-center gap-2",
            !arrows.previous && !arrows.next && "invisible"
          )}
        >
          <button
            type="button"
            className={ARROW_CLASS}
            onClick={() => step(-1)}
            disabled={!arrows.previous}
            aria-label={labels.previous}
            aria-controls={trackId}
            data-testid="category-rail-prev"
          >
            <ChevronLeft aria-hidden className="rtl:rotate-180" />
          </button>
          <button
            type="button"
            className={ARROW_CLASS}
            onClick={() => step(1)}
            disabled={!arrows.next}
            aria-label={labels.next}
            aria-controls={trackId}
            data-testid="category-rail-next"
          >
            <ChevronRight aria-hidden className="rtl:rotate-180" />
          </button>
        </div>
      </SectionHeader>
      <ul
        ref={ref}
        id={trackId}
        className="no-scrollbar -my-2 flex snap-x snap-mandatory gap-5 overflow-x-auto overscroll-x-contain py-2 [--n:1.5] xsmall:[--n:2.5] small:gap-6 small:[--n:3.2]"
        data-testid="category-rail-track"
      >
        {children}
      </ul>
    </div>
  )
}
