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
  const region = await getHomeRegion()
  if (!region) return null

  const read = async (queryParams: Parameters<typeof listProducts>[0]["queryParams"]) => {
    const { response } = await listProducts({ regionId: region.id, queryParams: { limit, ...queryParams } })
    return response.products
  }

  let selection: Selection
  if ("category" in source) {
    const categories = await listCategories()
    const category = categories.find((each) => each.handle === source.category)
    if (!category) return null
    selection = {
      title: category.name ?? null,
      products: await read({ category_id: categoryBranchIds(category.id, categories) }),
    }
  } else if ("collection" in source) {
    const collection = await getCollectionByHandle(source.collection)
    if (!collection) return null
    selection = { title: collection.title ?? null, products: await read({ collection_id: [collection.id] }) }
  } else {
    selection = { title: null, products: await read({ order: ORDER[source.sort] }) }
  }

  return selection.products.length ? selection : null
}
