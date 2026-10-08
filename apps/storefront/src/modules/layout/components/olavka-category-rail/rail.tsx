"use client"

import type { CSSProperties } from "react"
import { useEffect, useRef } from "react"
import { useTranslations } from "next-intl"

import { Link, usePathname } from "@i18n/navigation"
import Search from "@modules/layout/components/search"

import { SEARCH_TINT, type CategoryTint } from "./palette"
import { activeItemId, railShownOn, type RailItem } from "./rail-items"
import styles from "./rail.module.css"

const tintStyle = (tint: CategoryTint) =>
  ({
    "--tint-fill": tint.fill,
    "--tint-ink": tint.ink,
    "--tint-shade": tint.shade,
  }) as CSSProperties

/**
 * The row on the page (chrxnasdmds' `RailClient`): the search button, then a link per
 * category. The pathname decides whether the page has the row and which button is lit, so
 * the server part renders once in the header for every page of the shop.
 */
export default function OlavkaCategoryRailClient({ items }: { items: RailItem[] }) {
  const t = useTranslations("CategoryMenu")
  const path = usePathname() ?? "/"
  const shown = railShownOn(path)
  const active = shown ? activeItemId(path, items) : null
  const trackRef = useRef<HTMLUListElement>(null)

  // The lit button scrolled to the middle of a row wider than the window, as in chrxnasdmds:
  // on a phone the category the buyer is in is never off screen.
  useEffect(() => {
    const track = trackRef.current
    const link = track?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!track || !link || track.scrollWidth <= track.clientWidth) return
    const offset = link.getBoundingClientRect().left - track.getBoundingClientRect().left + track.scrollLeft
    track.scrollTo({ left: Math.max(0, offset - track.clientWidth / 2 + link.clientWidth / 2) })
  }, [active])

  if (!shown) {
    return null
  }

  return (
    <nav aria-label={t("title")} className={styles.rail} data-testid="olavka-category-rail">
      <ul ref={trackRef} className={styles.track}>
        <li className={styles.item} style={tintStyle(SEARCH_TINT)}>
          <Search className={`${styles.pill} ${styles.search}`} />
        </li>
        {items.map((item) => {
          const current = item.id === active
          return (
            <li key={item.id} className={styles.item}>
              <Link
                href={`/categories/${item.handle}`}
                aria-current={current ? "page" : undefined}
                className={styles.pill}
                style={tintStyle(item.tint)}
                data-testid="olavka-category-rail-link"
              >
                {item.name}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
