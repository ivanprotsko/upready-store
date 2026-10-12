import type { Metadata } from "next"
import type { ReactNode } from "react"

/**
 * The tab title and the robots rule of «Магазин не найден»
 * (t-2026-10-12-32 FX4). Here, not on the page: the page only throws
 * `notFound()`, and the not-found render takes its metadata from the layouts
 * above it. `noindex`, because an address with no shop must not reach search.
 */
export const metadata: Metadata = {
  title: "Магазин не найден · Shop not found",
  robots: { index: false, follow: false },
}

export default function ShopNotFoundLayout({ children }: { children: ReactNode }) {
  return children
}
