"use client"

import { useEffect } from "react"

/**
 * Branch `redesign-olavka` (t-2026-09-24-n15): marks the header wrapper
 * `data-scrolled="true"` once the page has scrolled past `threshold` px, and back at
 * the top — the Figma header set 227:9557 `Scrolled=true|false`. Only an attribute
 * React never renders, so no hydration mismatch; the look is pure CSS on it.
 */
export default function ScrollFlag({
  targetId,
  threshold = 12,
}: {
  targetId: string
  threshold?: number
}) {
  useEffect(() => {
    const el = document.getElementById(targetId)
    if (!el) return
    let frame = 0
    const apply = () => {
      frame = 0
      el.dataset.scrolled = window.scrollY > threshold ? "true" : "false"
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(apply)
    }
    apply()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [targetId, threshold])

  return null
}
