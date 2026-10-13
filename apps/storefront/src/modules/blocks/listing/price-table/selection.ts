import type { HttpTypes } from "@medusajs/types"

import { listCategories } from "@lib/data/categories"
import { getCollectionByHandle } from "@lib/data/collections"
import { getHomeRegion } from "@lib/data/home"
import { listProducts } from "@lib/data/products"
import { categoryBranchIds } from "@lib/util/category-tree"

import type { PriceTableSource } from "./props"

/** What the table draws: the source's own name and the products, in the source's order. */
export type Selection = {
  /** The category's or collection's name in the shop; null for a sort. */
  title: string | null
  products: HttpTypes.StoreProduct[]
}

/** The store API's own order for each sort of `source`. */
const ORDER = { newest: "-created_at", title: "title" } as const

/**
 * The products of one `source`, read through the storefront's own `"use server"` loaders
 * (BLOCK-CONTRACT.md §2) and priced for the visitor's region (`getHomeRegion`, as the listing
 * slot reads it), the way `collection/featured` reads its source. Not its reader, though: that
 * one keeps only the products with a picture once four have one, and knows the newest alone,
 * where a price list shows the whole range and sorts by title too. Every read is `/store/products`
 * with `listProducts`' own fields: the variants with their SKU, stock rule and calculated
 * price. The shop's sales channel scopes it, and it answers published products only.
 *
 * A category is looked up among the shop's own (`listCategories()`), so another shop's
 * handle finds nothing, and it brings its whole branch (`categoryBranchIds`).
 *
 * Null when there is nothing to show: no region, no such category or collection, no product.
 */
export async function readSelection(source: PriceTableSource, limit: number): Promise<Selection | null> {
  // The region and the source's own record are asked together, as `collection/featured` asks
  // them: on a cold cache one round trip before the products instead of two (stand-render-time).
  const [region, origin] = await Promise.all([getHomeRegion(), originOf(source)])
  if (!region || !origin) return null

  const { response } = await listProducts({ regionId: region.id, queryParams: { limit, ...origin.query } })
  return response.products.length ? { title: origin.title, products: response.products } : null
}

/** The source as the shop names it, and what the products are read by. */
type Origin = Pick<Selection, "title"> & { query: Parameters<typeof listProducts>[0]["queryParams"] }

/** Null when the shop has no such category or collection. */
async function originOf(source: PriceTableSource): Promise<Origin | null> {
  if ("category" in source) {
    const categories = await listCategories()
    const category = categories.find((each) => each.handle === source.category)
    if (!category) return null
    return { title: category.name ?? null, query: { category_id: categoryBranchIds(category.id, categories) } }
  }
  if ("collection" in source) {
    const collection = await getCollectionByHandle(source.collection)
    if (!collection) return null
    return { title: collection.title ?? null, query: { collection_id: [collection.id] } }
  }
  return { title: null, query: { order: ORDER[source.sort] } }
}
