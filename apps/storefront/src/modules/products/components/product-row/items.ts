import type { HttpTypes } from "@medusajs/types"

import { getProductPrice } from "@lib/util/get-product-price"

import type { ProductRowItem } from "./tile"

/**
 * One tile's worth of a product: the cheapest variant's price formatted once, here, so
 * the server row and the client-side «recently viewed» row show the same string for the
 * same product.
 */
export function toProductRowItem(
  product: HttpTypes.StoreProduct,
  locale: string
): ProductRowItem {
  const { cheapestPrice } = getProductPrice({ product, locale })
  const onSale = cheapestPrice?.price_type === "sale"

  return {
    id: product.id,
    handle: product.handle ?? "",
    title: product.title ?? "",
    thumbnail: product.thumbnail || product.images?.[0]?.url || null,
    price: cheapestPrice?.calculated_price ?? null,
    originalPrice: onSale ? cheapestPrice?.original_price ?? null : null,
    onSale,
  }
}
