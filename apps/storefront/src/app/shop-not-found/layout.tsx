import type { Metadata } from "next"
import type { ReactNode } from "react"

/**
 * The tab title and the robots rule of «Магазин не найден»
 * (t-2026-10-12-32 FX4). `noindex`, because an address with no shop must not
 * reach search; Next adds its own for the 404 status too, this one holds even
 * if the status were ever lost.
 */
export const metadata: Metadata = {
  title: "Магазин не найден · Shop not found",
  robots: { index: false, follow: false },
}

export default function ShopNotFoundLayout({ children }: { children: ReactNode }) {
  return children
}
