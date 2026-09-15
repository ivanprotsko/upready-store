"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useRef } from "react"

declare global {
  interface Window {
    ym?: (counterId: number, action: string, ...args: unknown[]) => void
  }
}

type SpaHitsProps = {
  counterId: number
}

/**
 * Metrica's own snippet counts the first load itself. This is an App Router
 * SPA: every later navigation is a client-side route change the snippet
 * never sees, so this effect calls `ym(id, "hit", url)` itself on every
 * pathname change after the first (the same shape as
 * `google-analytics/spa-pageviews.tsx`).
 */
const SpaHits = ({ counterId }: SpaHitsProps) => {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    const query = searchParams.toString()
    const url = query ? `${pathname}?${query}` : pathname

    window.ym?.(counterId, "hit", url)
  }, [counterId, pathname, searchParams])

  return null
}

export default SpaHits
