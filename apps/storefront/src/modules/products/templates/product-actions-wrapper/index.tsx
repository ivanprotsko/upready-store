import { retrieveCartSnapshot } from "@lib/data/cart"
import { isOlavkaShop } from "@lib/data/olavka-shop"
import { listProducts } from "@lib/data/products"
import type { HttpTypes } from "@medusajs/types"
import ProductActions from "@modules/products/components/product-actions"

/**
 * Fetches real time pricing for a product and renders the product actions component.
 *
 * On the Olavka shop (branch `redesign-olavka`, Ivan's remark 24) it also reads the
 * visitor's cart — a read, and none at all without a cart cookie — so a variant already in
 * the cart shows «В КОРЗИНЕ − N +» instead of «В корзину». Every other shop: no cart read.
 * The read is what the server renders; from the first click the client cart queue
 * (t-2026-10-03-66) holds the quantity, and the read's time stamp keeps a page restored
 * from the router's cache from undoing it.
 */
export default async function ProductActionsWrapper({
  id,
  region,
}: {
  id: string
  region: HttpTypes.StoreRegion
}) {
  const [product, olavka] = await Promise.all([
    listProducts({
      queryParams: { id: [id] },
      regionId: region.id,
    }).then(({ response }) => response.products[0]),
    isOlavkaShop(),
  ])

  if (!product) {
    return null
  }

  const cartSnapshot = olavka ? await retrieveCartSnapshot() : undefined

  return <ProductActions product={product} region={region} cartSnapshot={cartSnapshot} />
}
