import { sdk } from "@lib/config"
import { withCategoryProductRefs } from "@lib/util/category-products"
import type { HttpTypes } from "@medusajs/types"
import { getCacheOptions, getTenantHandle } from "./cookies"
import { siteWideRead } from "./site-wide"

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
): Promise<HttpTypes.StoreProductCategory[] | null> {
  /*
   * `null` for "the read failed", an array for an answer — including an empty
   * one. The nav and the footer render on every route under `(main)`, so an
   * error thrown here is not an empty strip, it is `Application error` in place
   * of the whole page; measured 2026-09-15 on `/{locale}/order/{id}/confirmed`,
   * where a request that could not name a shop got `400 Publishable API key
   * required` from the route below, which is not the 404 the fallback tests
   * for, and the buyer's confirmation answered 500. `lib/data/site-wide.ts`
   * carries the rule and the log line.
   */
  /*
   * Every category leaves this function with its `products` cut down
   * (t-2026-10-08-13, part A5, `util/category-products.ts`): drafts removed,
   * one `{ id }` per product that stays. It is the one read both
   * `listCategories` and `getCategoryByHandle` go through, and it runs BEFORE
   * any count below, so neither a menu nor a page's code ever holds a hidden
   * card or a card's text.
   */
  return siteWideRead<HttpTypes.StoreProductCategory[] | null>(
    "listCategories /store/tenant/product-categories",
    async () => {
      try {
        const { product_categories } =
          await sdk.client.fetch<CategoryListResponse>(
            "/store/tenant/product-categories",
            { query, next, cache: "force-cache" }
          )
        return product_categories.map((category) => withCategoryProductRefs(category))
      } catch (error) {
        if ((error as { status?: number })?.status !== 404) {
          throw error
        }

        const { product_categories } =
          await sdk.client.fetch<CategoryListResponse>(
            "/store/product-categories",
            { query, next, cache: "force-cache" }
          )
        return product_categories.map((category) => withCategoryProductRefs(category))
      }
    },
    null
  )
}

type VisibleProductsResponse = {
  products: { id: string; categories?: { id: string }[] | null }[]
  count: number
}

const VISIBLE_PRODUCTS_PAGE = 1000

/**
 * Ids of every category that holds at least one product the buyer can open
 * (U-17, 46df audit). A category's own `*products` relation lists EVERY linked
 * product, drafts and products outside the storefront's sales channel
 * included: on olavka «Антисептики» stayed in the header with one linked
 * product that is not published, and its page was empty. The category page
 * lists products through `/store/products`, which is published-only and
 * scoped to the publishable key's sales channel, so the menu asks the SAME
 * route which categories those products sit in.
 *
 * One request for the whole menu, not one per category: `fields=id,categories.id`
 * with a page of 1000 products; a bigger shop takes one more page per
 * thousand. Cached with the `products` tag, so publishing a product clears it
 * along with the listing it appears in; header, footer, `CategoryMenu` and the
 * H5/H6 chip row share the same fetch within a render.
 *
 * `null` when the read failed: the caller falls back to the category's own
 * `products` relation rather than emptying the menu.
 */
async function fetchCategoryIdsWithVisibleProducts(): Promise<Set<string> | null> {
  const next = {
    ...(await getCacheOptions("products")),
    // A-15 (46df audit): a ceiling for a dropped revalidation webhook — see
    // the same note in products.ts.
    revalidate: 3600,
  }

  try {
    const ids = new Set<string>()
    let offset = 0
    let count = 0

    do {
      const page = await sdk.client.fetch<VisibleProductsResponse>(
        "/store/products",
        {
          query: {
            limit: VISIBLE_PRODUCTS_PAGE,
            offset,
            fields: "id,categories.id",
          },
          next,
          cache: "force-cache",
        }
      )
      for (const product of page.products) {
        for (const category of product.categories ?? []) {
          ids.add(category.id)
        }
      }
      count = page.count
      offset += page.products.length
      if (page.products.length === 0) {
        break
      }
    } while (offset < count)

    return ids
  } catch (error) {
    console.error(
      "listCategories: /store/products could not say which categories hold a published product; " +
        "the menu falls back to each category's own products relation",
      error
    )
    return null
  }
}

const DEFAULT_CATEGORY_FIELDS =
  "*category_children, +category_children.metadata, +metadata, *products, *parent_category, *parent_category.parent_category"

/**
 * True when this category, or any descendant, carries at least one product
 * (A-13, 46df audit). A leaf with zero products is empty outright; a parent
 * is not, as long as some child or grandchild still has stock — products
 * attach to leaves, so a parent's OWN `products` relation is empty by design
 * even for a perfectly stocked shop (the same assumption
 * `listTopCategoriesWithCounts`'s own subtree count already makes, a few
 * lines below). `byId` resolves a child by its full record — the flat array
 * `listCategories` returns carries every category with `products` expanded,
 * while the SAME child embedded inside a parent's `category_children` does
 * not (the fields string never asks for `category_children.products`).
 */
function categoryHasProducts(
  category: HttpTypes.StoreProductCategory,
  byId: Map<string, HttpTypes.StoreProductCategory>,
  visible: Set<string> | null
): boolean {
  // U-17: with the storefront's own answer at hand, only a product the buyer
  // can open counts; the `products` relation is the fallback for a failed read.
  if (visible ? visible.has(category.id) : (category.products?.length ?? 0) > 0) {
    return true
  }

  return (category.category_children ?? []).some((child) =>
    categoryHasProducts(byId.get(child.id) ?? child, byId, visible)
  )
}

/**
 * Drops a category from the tree, at every level, when neither it nor any
 * descendant has a product — the menu entry the audit found leading to an
 * empty list (A-13: "Стимуляторы" on olavka.com, 9 categories, one of them
 * `count: 0`). `category_children` is rebuilt the same way on every surviving
 * category, so a drill-in submenu (`CategoryMenu`'s own two-level nav) never
 * opens on an empty leaf either.
 *
 * Gated on the caller having asked for `products` at all — `listCategories`
 * below only calls this when the resolved `fields` string names it, so a
 * caller that fetches `id,handle` alone (home.ts's tile matching, an id
 * lookup) is untouched: `products: undefined` cannot tell empty from
 * "never asked", and guessing empty would hide every category for them.
 */
function withoutEmptyCategories(
  categories: HttpTypes.StoreProductCategory[],
  visible: Set<string> | null
): HttpTypes.StoreProductCategory[] {
  const byId = new Map(categories.map((category) => [category.id, category]))

  const prune = (
    category: HttpTypes.StoreProductCategory
  ): HttpTypes.StoreProductCategory => ({
    ...category,
    category_children: (category.category_children ?? [])
      .map((child) => byId.get(child.id) ?? child)
      .filter((child) => categoryHasProducts(child, byId, visible))
      .map(prune),
  })

  return categories
    .filter((category) => categoryHasProducts(category, byId, visible))
    .map(prune)
}

/**
 * The menu's rule for a caller that reads its own category list
 * (t-2026-10-08-13, part A7): the sitemap listed 10 categories of a shop whose
 * menu showed 9, and `/llms.txt` named the same empty one. Each category has to
 * come with `id` and `*category_children`, which is what the rule walks: a
 * parent stays while a child still has a card the buyer can open.
 *
 * A failed product read keeps every category, the list the caller had before:
 * a sitemap that drops its categories on a network blip is worse than one that
 * names an empty page.
 */
export async function withoutCategoriesOffTheMenu<
  Category extends HttpTypes.StoreProductCategory
>(categories: Category[]): Promise<Category[]> {
  const visible = await fetchCategoryIdsWithVisibleProducts()

  if (!visible) {
    return categories
  }

  const byId = new Map<string, HttpTypes.StoreProductCategory>(
    categories.map((category) => [category.id, category])
  )

  return categories.filter((category) => categoryHasProducts(category, byId, visible))
}

export const listCategories = async (query?: Record<string, unknown>) => {
  const next = {
    ...(await getCacheOptions("categories")),
    // A-15 (46df audit): a ceiling for a dropped revalidation webhook — see
    // the same note in products.ts.
    revalidate: 3600,
  }

  const limit = query?.limit || 100
  const fields = (query?.fields as string | undefined) ?? DEFAULT_CATEGORY_FIELDS

  const product_categories = await fetchTenantCategories(
    {
      fields,
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
  // A failed read is not an empty catalog (rule 20a): it has already been
  // reported by name in `siteWideRead`, and letting it fall into the zero-check
  // below would report it a second time as a seeding bug it is not.
  if (product_categories === null) {
    return []
  }

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

  // A-13 (46df audit): only when this call actually asked for `products` —
  // `fields.includes("products")` covers both `*products` (the default) and
  // an explicit `handle,*products` override (hero-gallery-data.ts); a caller
  // that never requested it (home.ts's `id,handle`) gets its result back
  // unfiltered. Applied AFTER the zero-category log above on purpose: that
  // check asks "does this tenant own any category at all" (a seeding bug),
  // and must see the raw count, not one this filter has already thinned.
  return fields.includes("products")
    ? withoutEmptyCategories(product_categories, await fetchCategoryIdsWithVisibleProducts())
    : product_categories
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
  // Site-wide: header H5/H6 renders this chip row on every route under
  // `(main)`, and the count queries below are a second `/store/*` read that the
  // category read's own guard does not cover. Same rule, same file:
  // `lib/data/site-wide.ts`.
  return siteWideRead(
    "listTopCategoriesWithCounts /store/products",
    () => readTopCategoriesWithCounts(),
    { categories: [], totalCount: 0 }
  )
}

const readTopCategoriesWithCounts = async (): Promise<{
  categories: TopCategoryWithCount[]
  totalCount: number
}> => {
  const next = {
    ...(await getCacheOptions("categories")),
    // A-15 (46df audit): a ceiling for a dropped revalidation webhook — see
    // the same note in products.ts.
    revalidate: 3600,
  }

  const [categories, visible] = await Promise.all([
    listCategories({
      fields: "id,name,handle,parent_category_id,*category_children",
    }),
    fetchCategoryIdsWithVisibleProducts(),
  ])
  // U-17 (46df audit): the chip row follows the same rule as the menus — a
  // top category is shown only when its page lists at least one product. A
  // failed read keeps every chip, as before, rather than emptying the row.
  const byId = new Map(categories.map((category) => [category.id, category]))
  const topLevel = categories.filter(
    (category) =>
      !category.parent_category_id &&
      (!visible || categoryHasProducts(category, byId, visible))
  )

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
    // A-15 (46df audit): a ceiling for a dropped revalidation webhook — see
    // the same note in products.ts.
    revalidate: 3600,
  }

  const product_categories = await fetchTenantCategories(
    {
      fields:
        "*category_children, +category_children.metadata, +metadata, *products, *parent_category, *parent_category.parent_category",
      handle,
    },
    next
  )

  // A failed read is not "no such category": both answer undefined here, and the
  // caller (a category page) turns that into a 404. The difference is already in
  // the log, by name, from `siteWideRead`.
  return product_categories?.[0]
}
