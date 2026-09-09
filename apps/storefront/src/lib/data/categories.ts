import { sdk } from "@lib/config"
import type { HttpTypes } from "@medusajs/types"
import { getCacheOptions } from "./cookies"

export const listCategories = async (query?: Record<string, unknown>) => {
  const next = {
    ...(await getCacheOptions("categories")),
  }

  const limit = query?.limit || 100

  return sdk.client
    .fetch<{ product_categories: HttpTypes.StoreProductCategory[] }>(
      "/store/product-categories",
      {
        query: {
          fields:
            "*category_children, *products, *parent_category, *parent_category.parent_category",
          limit,
          ...query,
        },
        next,
        cache: "force-cache",
      }
    )
    .then(({ product_categories }) => product_categories)
}

export type TopCategoryWithCount = {
  id: string
  name: string
  handle: string
  count: number
}

/**
 * Top-level categories (no `parent_category_id`, the same filter
 * `footer/index.tsx`'s F1 variant already applies) plus a product count for each and
 * a store-wide total — for header H5/H6's category chip row
 * (`2026-09-09-block-port-map.md` §3, h5/h6 rows: "the storefront has no loader that
 * returns category product counts today").
 *
 * The count comes from `/store/products`' own pagination envelope
 * (`{ products, count, offset, limit }`), requested with `limit: 1` and a narrow
 * `fields` so only the count is paid for, not the catalog — confirmed live against
 * `http://localhost:9023` (sneakers): `category_id=[]` OR-ed together (a top category
 * plus its listed children, since products attach to leaf categories — a top-level
 * category alone answered `count: 0`; Footwear alone answered `count: 3`, and
 * Footwear plus its four children in one query answered `count: 11`, matching the sum
 * of each child's own count). The store total (`"All N"` in the composer,
 * `blocks.js:151-158`, `p.products.length`) is the same shape with no category filter
 * at all.
 *
 * Not exported from `listCategories` itself: that loader's default `fields` pulls
 * `*products` for every category (used by the footer's link lists), which this call
 * does not need and would rather not pay for twice, so it requests its own lighter
 * `fields` override.
 */
export const listTopCategoriesWithCounts = async (): Promise<{
  categories: TopCategoryWithCount[]
  totalCount: number
}> => {
  const next = {
    ...(await getCacheOptions("categories")),
  }

  const categories = await listCategories({
    fields: "id,name,handle,parent_category_id,*category_children",
  })
  const topLevel = categories.filter((category) => !category.parent_category_id)

  const countOf = (categoryIds?: string[]) =>
    sdk.client
      .fetch<{ count: number }>("/store/products", {
        query: {
          limit: 1,
          fields: "id",
          ...(categoryIds ? { category_id: categoryIds } : {}),
        },
        next,
        cache: "force-cache",
      })
      .then(({ count }) => count)

  const [totalCount, ...counts] = await Promise.all([
    countOf(),
    ...topLevel.map((category) =>
      countOf([
        category.id,
        ...(category.category_children ?? []).map((child) => child.id),
      ])
    ),
  ])

  return {
    totalCount,
    categories: topLevel.map((category, index) => ({
      id: category.id,
      name: category.name,
      handle: category.handle,
      count: counts[index],
    })),
  }
}

export const getCategoryByHandle = async (categoryHandle: string[]) => {
  const handle = `${categoryHandle.join("/")}`

  const next = {
    ...(await getCacheOptions("categories")),
  }

  return sdk.client
    .fetch<HttpTypes.StoreProductCategoryListResponse>(
      `/store/product-categories`,
      {
        query: {
          fields:
            "*category_children, *products, *parent_category, *parent_category.parent_category",
          handle,
        },
        next,
        cache: "force-cache",
      }
    )
    .then(({ product_categories }) => product_categories[0])
}
