"use client"

import { ChevronLeft, ChevronRight } from "@medusajs/icons"
import { clx } from "@medusajs/ui"
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react"

import styles from "./olavka-journal-rail.module.css"

// useLayoutEffect warns on the server; this island only ever positions in a browser.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

const ARROW_CLASS =
  "grid h-10 w-10 place-items-center rounded-full border border-ui-border-base bg-ui-bg-base text-ui-fg-base transition-colors duration-200 hover:bg-ui-bg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-fg-interactive disabled:opacity-40 disabled:hover:bg-ui-bg-base"

/**
 * The heading row and the track of the «Журнал здоровья» rail (ask d11e). The server
 * renders the cards; this island only moves the scroll position, so scroll-snap, a swipe
 * and a wheel stay native.
 *
 * A previous / next arrow moves the row by one card, for a mouse with no sideways scroll.
 * Clicks faster than the scroll count from the card the last click aims at.
 *
 * With `loop` the server renders the list three times, clone · real · clone (the clones
 * `aria-hidden` and out of the tab order, not laid out until this island marks the track
 * `data-loop-ready`). At rest the first real card leads the row and the last one peeks on
 * the other side, as in the frame; when a scroll settles on a clone, the track jumps by
 * exactly one set to the same card of the real set, which looks identical. Without `loop`
 * (a shop with a handful of articles) the rail has ends: an arrow that leads nowhere is
 * switched off, and both are hidden while every card fits the row.
 *
 * Positions are read with `offsetLeft` (layout px), as `OlavkaLoopTrack` does. A
 * right-to-left track counts its scroll position from 0 down, hence `startOf`. When the
 * track's width changes, the row comes back to the card that led it.
 */
export default function OlavkaJournalRailTrack({
  heading,
  setSize,
  loop,
  labels,
  children,
}: {
  /** The section's heading, drawn on the row's leading side, opposite the arrows. */
  heading: ReactNode
  /** How many articles one copy of the list holds. */
  setSize: number
  loop: boolean
  labels: { previous: string; next: string }
  children: ReactNode
}) {
  const ref = useRef<HTMLUListElement>(null)
  const stepRef = useRef<(dir: 1 | -1) => void>(() => {})
  const trackId = useId()
  const [arrows, setArrows] = useState({ previous: loop, next: loop })

  useIsoLayoutEffect(() => {
    const ul = ref.current
    if (!ul) return
    const items = () => Array.from(ul.children) as HTMLElement[]
    const rtl = getComputedStyle(ul).direction === "rtl"
    // The scroll position that puts a card's leading edge on the content's own line, which
    // is the track's inline padding.
    const startOf = (el: HTMLElement) => {
      const pad = parseFloat(getComputedStyle(ul).paddingInlineStart) || 0
      return rtl ? el.offsetLeft + el.offsetWidth - ul.clientWidth + pad : el.offsetLeft - pad
    }
    // The same, held to what the track can scroll to: the last cards of a rail with ends
    // never reach the leading line.
    const reach = (el: HTMLElement) => {
      const max = ul.scrollWidth - ul.clientWidth
      const start = startOf(el)
      return rtl ? Math.max(-max, Math.min(0, start)) : Math.min(max, Math.max(0, start))
    }
    // The card leading the row, among the cards laid out.
    const leading = () => {
      let idx = 0
      let best = Infinity
      items().forEach((el, i) => {
        if (!el.offsetWidth) return
        const d = Math.abs(startOf(el) - ul.scrollLeft)
        if (d < best) {
          best = d
          idx = i
        }
      })
      return idx
    }

    const measure = () => {
      if (loop) return
      const max = ul.scrollWidth - ul.clientWidth
      const at = Math.abs(ul.scrollLeft)
      const now = { previous: at > 1, next: at < max - 1 }
      setArrows((was) => (was.previous === now.previous && was.next === now.next ? was : now))
    }

    // The card an arrow's scroll is heading for, until it gets there.
    let target: number | null = null
    // The card that led the row when the scroll last settled: a change of the track's width
    // brings the row back to it.
    let anchor = 0
    let clickedAt = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    const step = (dir: 1 | -1) => {
      const all = items()
      const idx = Math.min(all.length - 1, Math.max(0, (target ?? leading()) + dir))
      target = idx
      clickedAt = performance.now()
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ul.scrollTo({ left: reach(all[idx]), behavior: still ? "instant" : "smooth" })
    }

    const settle = () => {
      measure()
      const all = items()
      // A scroll event while an arrow's scroll is still on its way: not settled yet. The loop
      // never jumps mid-flight, an instant scroll cut into a smooth one stops it (Chrome). A
      // scroll that never got there stops counting after 1.5 s.
      if (
        target !== null &&
        performance.now() - clickedAt < 1500 &&
        Math.abs(ul.scrollLeft - reach(all[target])) > 2
      )
        return
      target = null
      anchor = leading()
      if (!loop) return
      const setWidth = startOf(all[setSize]) - startOf(all[0])
      if (anchor < setSize) {
        anchor += setSize
        ul.scrollTo({ left: ul.scrollLeft + setWidth, behavior: "instant" })
      } else if (anchor >= setSize * 2) {
        anchor -= setSize
        ul.scrollTo({ left: ul.scrollLeft - setWidth, behavior: "instant" })
      }
    }
    stepRef.current = step

    // A wheel, a finger or a key takes over from the arrows.
    const onInput = () => {
      target = null
    }

    if (loop) {
      // The first paint shows the real cards alone. Lay the clones out and keep the card
      // that leads now (the first one, or the one a visitor swiped to before hydration) in
      // its place, before the next paint.
      const keep = items()[leading()]
      ul.setAttribute("data-loop-ready", "")
      ul.scrollTo({ left: startOf(keep), behavior: "instant" })
    }
    settle()

    const hasScrollEnd = "onscrollend" in window
    const onScroll = () => {
      measure()
      if (hasScrollEnd) return
      clearTimeout(timer)
      timer = setTimeout(settle, 140)
    }
    ul.addEventListener("scroll", onScroll, { passive: true })
    if (hasScrollEnd) ul.addEventListener("scrollend", settle)
    // The cards change width with the track (two, three or four in a row), and a scroll
    // position kept in px would then show another card. The observer also fires once when
    // it starts, on the row `settle` has just placed.
    const resized = new ResizeObserver(() => {
      onInput()
      const kept = items()[anchor]
      if (kept) ul.scrollTo({ left: reach(kept), behavior: "instant" })
      settle()
    })
    resized.observe(ul)
    const inputs = ["wheel", "touchstart", "pointerdown", "keydown"] as const
    inputs.forEach((type) => ul.addEventListener(type, onInput, { passive: true }))
    return () => {
      clearTimeout(timer)
      stepRef.current = () => {}
      ul.removeEventListener("scroll", onScroll)
      if (hasScrollEnd) ul.removeEventListener("scrollend", settle)
      resized.disconnect()
      inputs.forEach((type) => ul.removeEventListener(type, onInput))
    }
  }, [loop, setSize])

  return (
    <>
      <div className="content-container mb-6 flex items-end justify-between gap-4 small:mb-8">
        {heading}
        <div
          className={clx(
            "flex shrink-0 items-center gap-2",
            !arrows.previous && !arrows.next && "invisible"
          )}
        >
          <button
            type="button"
            className={ARROW_CLASS}
            onClick={() => stepRef.current(-1)}
            disabled={!arrows.previous}
            aria-label={labels.previous}
            aria-controls={trackId}
            data-testid="olavka-journal-rail-prev"
          >
            <ChevronLeft aria-hidden className="rtl:rotate-180" />
          </button>
          <button
            type="button"
            className={ARROW_CLASS}
            onClick={() => stepRef.current(1)}
            disabled={!arrows.next}
            aria-label={labels.next}
            aria-controls={trackId}
            data-testid="olavka-journal-rail-next"
          >
            <ChevronRight aria-hidden className="rtl:rotate-180" />
          </button>
        </div>
      </div>
      <ul
        ref={ref}
        id={trackId}
        className={styles.track}
        data-loop={loop || undefined}
        data-testid="olavka-journal-rail-track"
      >
        {children}
      </ul>
    </>
  )
}
