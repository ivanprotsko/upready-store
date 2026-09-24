import { listProducts } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import type { HttpTypes } from "@medusajs/types"
import { getLocale, getTranslations } from "next-intl/server"

import ProductRow from "@modules/products/components/product-row"
import { toProductRowItem } from "@modules/products/components/product-row/items"

type RelatedProductsProps = {
  product: HttpTypes.StoreProduct
  countryCode: string
}

/** The mockup's row is four tiles wide and one row deep. */
export const RELATED_PRODUCTS_COUNT = 4

/**
 * «С этим товаром покупают»: the same related query as before (the product's collection
 * and tags, in the visitor's region), now one row of four tiles after the mockup instead
 * of a grid of eight cards. One product more than the row holds is asked for, because
 * the product itself is usually in its own collection and is taken out.
 */
export default async function RelatedProducts({
  product,
  countryCode,
}: RelatedProductsProps) {
  const [region, t, locale] = await Promise.all([
    getRegion(countryCode),
    getTranslations("RelatedProducts"),
    getLocale(),
  ])

  if (!region) {
    return null
  }

  // edit this function to define your related products logic
  const queryParams: HttpTypes.StoreProductListParams = {}
  if (region?.id) {
    queryParams.region_id = region.id
  }
  if (product.collection_id) {
    queryParams.collection_id = [product.collection_id]
  }
  if (product.tags) {
    queryParams.tag_id = product.tags
      .map((tag) => tag.id)
      .filter(Boolean) as string[]
  }
  queryParams.is_giftcard = false
  queryParams.limit = RELATED_PRODUCTS_COUNT + 1

  const products = await listProducts({ queryParams, countryCode }).then(
    ({ response }) =>
      response.products.filter(
        (responseProduct) => responseProduct.id !== product.id
      )
  )

  if (!products.length) {
    return null
  }

  return (
    <ProductRow
      heading={t("title")}
      items={products
        .slice(0, RELATED_PRODUCTS_COUNT)
        .map((item) => toProductRowItem(item, locale))}
      columns={4}
      data-testid="related-products"
    />
  )
}
