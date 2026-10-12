import type { HttpTypes } from "@medusajs/types"

import { listCategories } from "@lib/data/categories"
import { getCollectionByHandle } from "@lib/data/collections"
import { getHomeRegion } from "@lib/data/home"
import { listProducts } from "@lib/data/products"
import { categoryBranchIds } from "@lib/util/category-tree"

import type { FeaturedSource } from "./props"

/** What the section draws: the source's own name, where «see all» leads, and the products. */
export type Selection = {
  /** The category's or collection's name in the shop; null for a sort. */
  title: string | null
  href: string
  products: HttpTypes.StoreProduct[]
}

/**
 * The products of one `source`, read through the storefront's own `"use server"` loaders
 * (BLOCK-CONTRACT.md §2), priced for the visitor's region (`getHomeRegion`, as the listing
 * slot reads it). Every read is `/store/products`, which the shop's sales channel scopes and
 * which answers published products only. A category is looked up among the shop's own, the
 * list the menu and the category page read (`listCategories()`), so another shop's handle
 * finds nothing, and it brings its whole branch: products live on the leaves, and a parent's
 * page lists them all (`categoryBranchIds`).
 *
 * Like the listing slot (`lib/data/home.ts`), it prefers the products with a picture while
 * at least four of them, or `limit` if fewer, have one.
 *
 * Null when there is nothing to show: no region, no such category or collection, no product.
 */
export async function readSelection(source: FeaturedSource, limit: number): Promise<Selection | null> {
  const region = await getHomeRegion()
  if (!region) return null

  const read = async (queryParams: Parameters<typeof listProducts>[0]["queryParams"]) => {
    const { response } = await listProducts({ regionId: region.id, queryParams: { limit, ...queryParams } })
    const withImage = response.products.filter((product) => !!product.thumbnail)
    return withImage.length >= Math.min(4, limit) ? withImage : response.products
  }

  let selection: Selection
  if ("category" in source) {
    const categories = await listCategories()
    const category = categories.find((each) => each.handle === source.category)
    if (!category) return null
    selection = {
      title: category.name ?? null,
      href: `/categories/${category.handle}`,
      products: await read({ category_id: categoryBranchIds(category.id, categories) }),
    }
  } else if ("collection" in source) {
    const collection = await getCollectionByHandle(source.collection)
    if (!collection) return null
    selection = {
      title: collection.title ?? null,
      href: `/collections/${collection.handle}`,
      products: await read({ collection_id: [collection.id] }),
    }
  } else {
    // `/store`'s own «newest» sort, so «see all» opens the catalogue in the same order.
    selection = { title: null, href: "/store?sortBy=created_at", products: await read({ order: "-created_at" }) }
  }

  return selection.products.length ? selection : null
}
