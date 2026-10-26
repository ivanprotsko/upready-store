"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { TocItem } from "@lib/util/markdown-toc"

/**
 * The section of the article the reader is in, after the chrxnasdmds journal: the last
 * heading whose top edge has passed a line a quarter down the window (never less than
 * 120 px, under the sticky header). Read on scroll and resize, once per frame.
 *
 * `go(id)` scrolls a heading to the top (its `scroll-mt-24` keeps it clear of the header),
 * writes the anchor into the address and holds the highlight on that entry for 700 ms, so
 * the smooth scroll does not flicker it through the sections it passes.
 */
export function useActiveHeading(items: TocItem[]) {
  const [active, setActive] = useState(items[0]?.id ?? "")
  const lockedUntil = useRef(0)

  useEffect(() => {
    if (items.length === 0) return
    let frame = 0

    const compute = () => {
      if (Date.now() < lockedUntil.current) return
      const line = Math.max(window.innerHeight * 0.25, 120)
      let next = items[0].id
      for (const item of items) {
        const el = document.getElementById(item.id)
        if (!el) continue
        if (el.getBoundingClientRect().top <= line) next = item.id
        else break
      }
      setActive((was) => (was === next ? was : next))
    }
    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        compute()
      })
    }

    compute()
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule, { passive: true })
    return () => {
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [items])

  const go = useCallback((id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    setActive(id)
    lockedUntil.current = Date.now() + 700
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    el.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" })
    window.history.replaceState(null, "", `#${encodeURIComponent(id)}`)
  }, [])

  return { active, go }
}
