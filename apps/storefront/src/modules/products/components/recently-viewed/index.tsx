"use client"

import { useLocale, useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import { listRecentlyViewedItems } from "@lib/data/recently-viewed"
import { rememberViewed } from "@lib/util/recently-viewed"
import ProductRow from "@modules/products/components/product-row"
import type { ProductRowItem } from "@modules/products/components/product-row/tile"

/** Fewer earlier products than this, and there is no row at all — not an empty heading. */
export const RECENTLY_VIEWED_MIN = 2
/** The mockup's row is six tiles wide and one row deep. */
export const RECENTLY_VIEWED_COLUMNS = 6

const safeLocalStorage = (): Storage | null => {
  try {
    return window.localStorage
  } catch {
    // Blocked storage (cookies off, a sandboxed frame) throws on the property itself.
    return null
  }
}

/**
 * «Вы недавно просматривали»: the products this browser opened before the current one,
 * six in a row after Ivan's Figma mockup. The list lives in localStorage and nowhere
 * else, so this is a client component: on mount it reads the list, records the current
 * product for the next page, and asks the server for the tiles of what stood there
 * before. The server renders nothing for it, and the row appears only once the tiles
 * are known, under everything else on the page — so nothing shifts under a reader and a
 * first visit shows no heading over an empty line.
 */
export default function RecentlyViewed({
  currentHandle,
  countryCode,
}: {
  currentHandle: string
  countryCode: string
}) {
  const t = useTranslations("RecentlyViewed")
  const locale = useLocale()
  const [items, setItems] = useState<ProductRowItem[]>([])

  useEffect(() => {
    let cancelled = false
    const previous = rememberViewed(safeLocalStorage(), currentHandle)

    if (previous.length < RECENTLY_VIEWED_MIN) {
      setItems([])
      return
    }

    listRecentlyViewedItems({ handles: previous, countryCode, locale })
      .then((found) => {
        if (!cancelled) {
          setItems(found.slice(0, RECENTLY_VIEWED_COLUMNS))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setItems([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [currentHandle, countryCode, locale])

  if (items.length < RECENTLY_VIEWED_MIN) {
    return null
  }

  return (
    <ProductRow
      heading={t("title")}
      items={items}
      columns={RECENTLY_VIEWED_COLUMNS}
      data-testid="recently-viewed"
    />
  )
}
