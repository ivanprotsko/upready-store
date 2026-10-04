import type { HttpTypes } from "@medusajs/types"
import type { SortOptions } from "@modules/store/components/refinement-list/sort-products"

interface MinPricedProduct extends HttpTypes.StoreProduct {
  _minPrice?: number
}

/**
 * Helper function to sort products by price until the store API supports sorting by price
 * @param products
 * @param sortBy
 * @returns products sorted by price
 */
export function sortProducts(
  products: HttpTypes.StoreProduct[],
  sortBy: SortOptions
): HttpTypes.StoreProduct[] {
  const sortedProducts = products as MinPricedProduct[]

  if (["price_asc", "price_desc"].includes(sortBy)) {
    // Precompute the minimum price for each product
    sortedProducts.forEach((product) => {
      if (product.variants && product.variants.length > 0) {
        product._minPrice = Math.min(
          ...product.variants.map(
            (variant) => variant?.calculated_price?.calculated_amount || 0
          )
        )
      } else {
        product._minPrice = Infinity
      }
    })

    // Sort products based on the precomputed minimum prices
    sortedProducts.sort((a, b) => {
      const diff = a._minPrice! - b._minPrice!
      return sortBy === "price_asc" ? diff : -diff
    })
  }

  if (sortBy === "created_at") {
    sortedProducts.sort((a, b) => {
      return (
        new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime()
      )
    })
  }

  // 04.10.2026 (demo QA t-19, devops 22k): a product with no picture goes to the end of every
  // listing, whatever the sort, so a catalogue never opens on a row of «Фото скоро будет»; one
  // with no price in this region's currency (it cannot be bought here) goes after those. The sort
  // is stable, so each group keeps the order chosen above. The owner's data is left alone.
  sortedProducts.sort((a, b) => sinkRank(a) - sinkRank(b))

  return sortedProducts
}

const hasPrice = (product: HttpTypes.StoreProduct): boolean =>
  (product.variants ?? []).some((variant) => variant?.calculated_price?.calculated_amount != null)

const sinkRank = (product: HttpTypes.StoreProduct): number =>
  (hasPrice(product) ? 0 : 2) + (hasPicture(product) ? 0 : 1)

const hasPicture = (product: HttpTypes.StoreProduct): boolean =>
  Boolean(product.thumbnail || product.images?.length)
