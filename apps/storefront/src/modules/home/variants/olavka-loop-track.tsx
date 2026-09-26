"use client"

import { ChevronLeft, ChevronRight } from "@medusajs/icons"
import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from "react"
import headerStyles from "@modules/layout/templates/nav/variants/h7.module.css"

import styles from "./olavka-hero-slider.module.css"

// useLayoutEffect warns on the server; this island only ever positions in a browser.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

/**
 * The endless track of the olavka banner carousel (3+ banners, Ivan 2026-09-25: «слева
 * в ленте 3+ пусть будет последний баннер, зациклить»). The server renders the set
 * three times — clone · real · clone, the clones `aria-hidden` and out of the tab order —
 * and this island only moves the scroll position: at rest the first REAL card is centred
 * (the last one peeks left, the second right; CSS draws that before hydration, and the
 * island marks the track `data-loop-ready` when it takes over); when a scroll settles on a
 * clone, the track jumps by exactly one set to the same card in the real set, which looks
 * identical, so there is no visible jump and scroll-snap / swipe stay native. Positions
 * are read with `offsetLeft` (layout px), so the page zoom above 1440 does not skew them.
 *
 * The previous / next arrows (Ivan's remark 22: a desktop mouse with no touchpad cannot
 * scroll sideways) move the centred card by one, through the same loop. Clicks faster than
 * the scroll count from the card the last click aims at, so three quick clicks move three
 * cards. The arrows show from the desktop breakpoint up, once the island is ready (CSS).
 * Each arrow is the header's burger disc (h7 `disc`: box, icon, ring, shadow, hover, focus)
 * at the header's edge offsets (Ivan's remark of 2026-09-27).
 */
export default function OlavkaLoopTrack({
  className,
  setSize,
  labels,
  children,
}: {
  className: string
  setSize: number
  labels: { previous: string; next: string }
  children: ReactNode
}) {
  const ref = useRef<HTMLUListElement>(null)
  const stepRef = useRef<(dir: 1 | -1) => void>(() => {})
  const trackId = useId()

  useIsoLayoutEffect(() => {
    const ul = ref.current
    if (!ul) return
    const items = () => Array.from(ul.children) as HTMLElement[]
    const centre = (el: HTMLElement) =>
      el.offsetLeft - (ul.clientWidth - el.offsetWidth) / 2
    // The card nearest the middle, among the cards laid out (before `data-loop-ready` the
    // leading clones but the last are `display: none`).
    const centred = () => {
      const mid = ul.scrollLeft + ul.clientWidth / 2
      let idx = 0
      let best = Infinity
      items().forEach((el, i) => {
        if (!el.offsetWidth) return
        const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid)
        if (d < best) {
          best = d
          idx = i
        }
      })
      return idx
    }

    // The card an arrow's scroll is heading for, until it gets there, and the clicks that
    // ran past the last clone (more quick clicks than there are banners), made after it.
    let target: number | null = null
    let pending = 0
    let clickedAt = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let pendingTimer: ReturnType<typeof setTimeout> | undefined

    const step = (dir: 1 | -1) => {
      const all = items()
      const idx = (target ?? centred()) + dir
      if (idx < 0 || idx >= all.length) {
        pending += dir
        return
      }
      target = idx
      clickedAt = performance.now()
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ul.scrollTo({ left: centre(all[idx]), behavior: still ? "instant" : "smooth" })
    }

    const settle = () => {
      const all = items()
      // A scroll event while an arrow's scroll is still on its way: not settled yet. The loop
      // never jumps mid-flight — an instant scroll cut into a smooth one stops it (Chrome).
      // A scroll that never got there (cut short by something else) stops counting after 1.5 s.
      if (
        target !== null &&
        performance.now() - clickedAt < 1500 &&
        Math.abs(ul.scrollLeft - centre(all[target])) > 2
      )
        return
      target = null
      const idx = centred()
      const setWidth = all[setSize].offsetLeft - all[0].offsetLeft
      if (idx < setSize) ul.scrollTo({ left: ul.scrollLeft + setWidth, behavior: "instant" })
      else if (idx >= setSize * 2)
        ul.scrollTo({ left: ul.scrollLeft - setWidth, behavior: "instant" })
      // The clicks past the clones go once the jump has settled too: the browser re-snaps
      // after an instant scroll, and that snap would cut a smooth scroll started before it.
      clearTimeout(pendingTimer)
      if (pending) {
        pendingTimer = setTimeout(() => {
          const n = pending
          pending = 0
          for (let i = 0; i < Math.abs(n); i++) step(n > 0 ? 1 : -1)
        }, 120)
      }
    }
    stepRef.current = step

    // A wheel, a finger or a key takes over from the arrows.
    const onInput = () => {
      clearTimeout(pendingTimer)
      target = null
      pending = 0
    }

    // The server's first paint already shows the rest position (the first real card
    // centred, the last clone peeking left; see `.carousel:not([data-loop-ready])`). Put the
    // leading clones back and keep the card that is centred now — the first real one, or
    // the one a visitor swiped to before hydration — in the middle, before the next paint.
    const keep = items()[centred()]
    ul.setAttribute("data-loop-ready", "")
    ul.scrollTo({ left: centre(keep), behavior: "instant" })
    settle()
    const onScroll = () => {
      clearTimeout(timer)
      timer = setTimeout(settle, 140)
    }
    const hasScrollEnd = "onscrollend" in window
    if (hasScrollEnd) ul.addEventListener("scrollend", settle)
    else ul.addEventListener("scroll", onScroll, { passive: true })
    const onResize = () => {
      onInput()
      settle()
    }
    window.addEventListener("resize", onResize)
    const inputs = ["wheel", "touchstart", "pointerdown", "keydown"] as const
    inputs.forEach((type) => ul.addEventListener(type, onInput, { passive: true }))
    return () => {
      clearTimeout(timer)
      clearTimeout(pendingTimer)
      stepRef.current = () => {}
      if (hasScrollEnd) ul.removeEventListener("scrollend", settle)
      else ul.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onResize)
      inputs.forEach((type) => ul.removeEventListener(type, onInput))
    }
  }, [setSize])

  return (
    <div className={styles.loop}>
      <ul ref={ref} id={trackId} className={className} data-loop="true">
        {children}
      </ul>
      <button
        type="button"
        className={`${headerStyles.disc} ${styles.arrow} ${styles.arrowPrevious}`}
        onClick={() => stepRef.current(-1)}
        aria-label={labels.previous}
        aria-controls={trackId}
        data-testid="olavka-hero-slider-prev"
      >
        <ChevronLeft aria-hidden />
      </button>
      <button
        type="button"
        className={`${headerStyles.disc} ${styles.arrow} ${styles.arrowNext}`}
        onClick={() => stepRef.current(1)}
        aria-label={labels.next}
        aria-controls={trackId}
        data-testid="olavka-hero-slider-next"
      >
        <ChevronRight aria-hidden />
      </button>
    </div>
  )
}
