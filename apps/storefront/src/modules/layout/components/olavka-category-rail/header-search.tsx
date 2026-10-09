"use client"

import { usePathname } from "@i18n/navigation"
import Search from "@modules/layout/components/search"

import { railShownOn } from "./rail-items"

/**
 * The magnifier of the Olavka bar on the pages without the category row (t-2026-10-09-75).
 * The row stands on the home page only (Ivan, 09.10: «вот эту навигацию оставляем только на
 * главной странице»), and its first button was the bar's search. Everywhere else the bar
 * carries the same control, left of the account icon, where every other header has it (Ivan,
 * 04.10, ask 14ba). On the home page the row's own magnifier is the one, unless the shop has no
 * category and so no row (`railDrawn`).
 *
 * Desktop only: below 1024 the bottom bar's magnifier is on every page (`BottomNav`).
 */
export default function HeaderSearch({
  className,
  railDrawn,
}: {
  className?: string
  railDrawn: boolean
}) {
  const path = usePathname() ?? "/"

  if (railDrawn && railShownOn(path)) {
    return null
  }

  return <Search className={className} />
}
