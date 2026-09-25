"use client"

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react"

// useLayoutEffect warns on the server; this island only ever positions in a browser.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

/**
 * The endless track of the olavka banner carousel (3+ banners, Ivan 2026-09-25: «слева
 * в ленте 3+ пусть будет последний баннер, зациклить»). The server renders the set
 * three times — clone · real · clone, the clones `inert` + `aria-hidden` — and this
 * island only moves the scroll position: at rest the first REAL card is centred (the
 * last one peeks left, the second right; CSS draws that before hydration, and the island
 * marks the track `data-loop-ready` when it takes over); when a scroll settles on a
 * clone, the track jumps by exactly one set to the same card in the real set, which looks
 * identical, so there is no visible jump and scroll-snap / swipe stay native. Positions
 * are read with `offsetLeft` (layout px), so the page zoom above 1440 does not skew them.
 */
export default function OlavkaLoopTrack({
  className,
  setSize,
  children,
}: {
  className: string
  setSize: number
  children: ReactNode
}) {
  const ref = useRef<HTMLUListElement>(null)

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

    let timer: ReturnType<typeof setTimeout> | undefined
    const settle = () => {
      const all = items()
      const idx = centred()
      const setWidth = all[setSize].offsetLeft - all[0].offsetLeft
      if (idx < setSize) ul.scrollTo({ left: ul.scrollLeft + setWidth, behavior: "instant" })
      else if (idx >= setSize * 2)
        ul.scrollTo({ left: ul.scrollLeft - setWidth, behavior: "instant" })
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
    const onResize = () => settle()
    window.addEventListener("resize", onResize)
    return () => {
      clearTimeout(timer)
      if (hasScrollEnd) ul.removeEventListener("scrollend", settle)
      else ul.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onResize)
    }
  }, [setSize])

  return (
    <ul ref={ref} className={className} data-loop="true">
      {children}
    </ul>
  )
}
