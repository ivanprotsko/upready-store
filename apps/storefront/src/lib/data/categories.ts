import { sdk } from "@lib/config"
import type { HttpTypes } from "@medusajs/types"
import { getCacheOptions, getTenantHandle } from "./cookies"

type CategoryListResponse = { product_categories: HttpTypes.StoreProductCategory[] }

/**
 * Tenant-scoped read, with the documented single-store fallback (piece 9,
 * docs/multitenancy/storefront-by-host.md §2). Categories are global in
 * Medusa — no sales channel, no owner column — so unlike products, the
 * catalog-wide `/store/product-categories` route was never isolated: every
 * tenant listed the same 20 categories, spanning all three profiles
 * (t-2026-09-12-mt-storefront-by-host, defect measured on
 * acme.shipshift.dev/globex.shipshift.dev). `/store/tenant/product-categories`
 * scopes through the `tenant-product-category` link
 * (`apps/backend/src/api/tenants/tenant-scope.ts`); a key with no tenant
 * behind it (`resolveTenantFromPublishableKey`) answers 404, the same branch
 * `lib/data/tenant-home.ts` already falls back on for `/store/tenant/home`,
 * so a single-store deployment keeps reading the global route, unchanged.
 */
async function fetchTenantCategories(
  query: Record<string, unknown>,
  next: Record<string, unknown>
): Promise<HttpTypes.StoreProductCategory[]> {
  try {
    const { product_categories } = await sdk.client.fetch<CategoryListResponse>(
      "/store/tenant/product-categories",
      { query, next, cache: "force-cache" }
    )
    return product_categories
  } catch (error) {
    if ((error as { status?: number })?.status !== 404) {
      throw error
    }

    const { product_categories } = await sdk.client.fetch<CategoryListResponse>(
      "/store/product-categories",
      { query, next, cache: "force-cache" }
    )
    return product_categories
  }
}

export const listCategories = async (query?: Record<string, unknown>) => {
  const next = {
    ...(await getCacheOptions("categories")),
  }

  const limit = query?.limit || 100

  const product_categories = await fetchTenantCategories(
    {
      fields:
        "*category_children, +category_children.metadata, +metadata, *products, *parent_category, *parent_category.parent_category",
      limit,
      ...query,
    },
    next
  )

  // rule 20a: a tenant that resolves but owns no category is a seeding/link
  // bug (seed-mt-demo.ts binds every seeded tenant's categories), not a shop
  // with nothing to sell — an empty list here would render as a silently
  // empty nav/footer. Only checked for the unfiltered tree read: a `handle`
  // that does not exist is `getCategoryByHandle`'s own, legitimate, empty
  // result below.
  if (product_categories.length === 0 && !query?.handle) {
    // SWEEP_OK — getTenantHandle() never throws and a missing handle is
    // never an error (its own doc comment in cookies.ts); `if (handle)`
    // below only gates whether to log, it never dereferences a null value.
    const handle = await getTenantHandle()

    if (handle) {
      console.error(
        `listCategories: tenant "${handle}" resolved but owns zero product categories ` +
          `(checked /store/tenant/product-categories). This is very likely a seeding/link ` +
          `bug, not an empty shop.`
      )
    }
  }

  return product_categories
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
 * at all. `/store/products` is already tenant-scoped through the publishable key's
 * sales channel, unaffected by this file's own category isolation fix.
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

  const product_categories = await fetchTenantCategories(
    {
      fields:
        "*category_children, +category_children.metadata, +metadata, *products, *parent_category, *parent_category.parent_category",
      handle,
    },
    next
  )

  return product_categories[0]
}
