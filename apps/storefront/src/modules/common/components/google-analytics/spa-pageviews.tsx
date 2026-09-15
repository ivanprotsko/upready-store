"use client"

import { sendGAEvent } from "@next/third-parties/google"
import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useRef } from "react"

/**
 * `@next/third-parties`'s `GoogleAnalytics` fires one `page_view` on the
 * first load and never again (measured against its shipped source, no
 * `usePathname` anywhere in it) — this is an App Router SPA, so every later
 * navigation is a client-side route change the library never sees. This
 * effect sends the missed event itself, through `sendGAEvent`, which posts to
 * the same `dataLayer` the library's own script already set up.
 */
const SpaPageviews = () => {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      // The library's own script already sent this one on load.
      isFirstRender.current = false
      return
    }

    const query = searchParams.toString()
    sendGAEvent("event", "page_view", {
      page_path: query ? `${pathname}?${query}` : pathname,
    })
  }, [pathname, searchParams])

  return null
}

export default SpaPageviews
