"use server"

import { listProducts } from "@lib/data/products"
import {
  PRODUCT_HANDLE,
  RECENTLY_VIEWED_LIMIT,
} from "@lib/util/recently-viewed"
import { toProductRowItem } from "@modules/products/components/product-row/items"
import type { ProductRowItem } from "@modules/products/components/product-row/tile"

/**
 * The tiles behind the handles a browser remembers, in the browser's order (newest
 * first), priced in the visitor's region and formatted in the visitor's locale. The
 * input comes from localStorage, so it is checked here once more and capped; a handle
 * nobody sells any more is simply absent from the answer.
 */
export async function listRecentlyViewedItems({
  handles,
  countryCode,
  locale,
}: {
  handles: string[]
  countryCode: string
  locale: string
}): Promise<ProductRowItem[]> {
  const wanted = Array.from(
    new Set(
      (Array.isArray(handles) ? handles : []).filter(
        (handle) => typeof handle === "string" && PRODUCT_HANDLE.test(handle)
      )
    )
  ).slice(0, RECENTLY_VIEWED_LIMIT)

  if (!wanted.length || typeof countryCode !== "string" || !countryCode) {
    return []
  }

  const { response } = await listProducts({
    queryParams: { handle: wanted, limit: wanted.length },
    countryCode,
  })

  const byHandle = new Map(
    response.products.map((product) => [product.handle, product])
  )

  return wanted.flatMap((handle) => {
    const product = byHandle.get(handle)
    return product
      ? [toProductRowItem(product, typeof locale === "string" ? locale : "en")]
      : []
  })
}
