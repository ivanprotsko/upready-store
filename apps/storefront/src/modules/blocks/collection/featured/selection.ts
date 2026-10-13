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
  // The region and the source's own record do not need each other, so they are asked together:
  // on a cold cache that is one round trip before the products instead of two (stand-render-time).
  const [region, origin] = await Promise.all([getHomeRegion(), originOf(source)])
  if (!region || !origin) return null

  const { response } = await listProducts({ regionId: region.id, queryParams: { limit, ...origin.query } })
  const withImage = response.products.filter((product) => !!product.thumbnail)
  const products = withImage.length >= Math.min(4, limit) ? withImage : response.products

  return products.length ? { title: origin.title, href: origin.href, products } : null
}

/** The source as the shop names it, where «see all» leads, and what the products are read by. */
type Origin = Pick<Selection, "title" | "href"> & { query: Parameters<typeof listProducts>[0]["queryParams"] }

/** Null when the shop has no such category or collection. */
async function originOf(source: FeaturedSource): Promise<Origin | null> {
  if ("category" in source) {
    const categories = await listCategories()
    const category = categories.find((each) => each.handle === source.category)
    if (!category) return null
    return {
      title: category.name ?? null,
      href: `/categories/${category.handle}`,
      query: { category_id: categoryBranchIds(category.id, categories) },
    }
  }
  if ("collection" in source) {
    const collection = await getCollectionByHandle(source.collection)
    if (!collection) return null
    return {
      title: collection.title ?? null,
      href: `/collections/${collection.handle}`,
      query: { collection_id: [collection.id] },
    }
  }
  // `/store`'s own «newest» sort, so «see all» opens the catalogue in the same order.
  return { title: null, href: "/store?sortBy=created_at", query: { order: "-created_at" } }
}
