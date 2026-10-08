import type { HttpTypes } from "@medusajs/types"

import ProductCard from "@modules/products/components/product-card"

/**
 * The catalog's card. It is the shared `ProductCard` and nothing else, so the catalog, a
 * category, a collection, the related products and the home page all draw one card.
 *
 * `region` and `isFeatured` stay in the contract for the call sites that pass them:
 * pricing is already resolved onto `product.variants[].calculated_price` by the caller's
 * own `listProducts({ regionId })`, and a featured card has the same frame as any other.
 */
export default async function ProductPreview({
  product,
  priority,
  layout,
}: {
  product: HttpTypes.StoreProduct
  isFeatured?: boolean
  priority?: boolean
  region: HttpTypes.StoreRegion
  /** `row` in the catalog's list view; the card everywhere else. */
  layout?: "card" | "row"
}) {
  return <ProductCard product={product} priority={priority} layout={layout} />
}
