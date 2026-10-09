import type { HttpTypes } from "@medusajs/types"

import type { CatalogView } from "@lib/util/catalog-view"
import ProductPreview from "@modules/products/components/product-preview"

/**
 * The cards of one stretch of a product list, one `<li>` each. The server's first screens
 * (`ProductsListing`) and every batch the browser asks for later (`loadProductBatch`) are drawn
 * by this one component, so a card that arrives in the background is the same card.
 */
export default function ProductListItems({
  products,
  region,
  view,
  priorityCount = 0,
}: {
  products: HttpTypes.StoreProduct[]
  region: HttpTypes.StoreRegion
  view: CatalogView
  /** How many of the first cards load their picture first: the first screen's, never a batch's. */
  priorityCount?: number
}) {
  return (
    <>
      {products.map((product, index) => (
        <li key={product.id} className="min-w-0">
          <ProductPreview
            product={product}
            region={region}
            priority={index < priorityCount}
            layout={view === "list" ? "row" : "card"}
          />
        </li>
      ))}
    </>
  )
}
