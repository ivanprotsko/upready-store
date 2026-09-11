"use server"

import { defaultLocale } from "@i18n/config"
import type { HttpTypes } from "@medusajs/types"

import { getCountryCode } from "./cookies"
import { getRegion } from "./regions"
import { listCollections } from "./collections"
import { listCategories } from "./categories"
import { listProducts } from "./products"

/**
 * Shared data resolution for the hero (G/H/J/M) and listing (P1-P5) home-slot variants,
 * `2026-09-09-block-port-map.md` §4/§6. None of this existed before this package: the
 * profile-driven baseline (K/`ProfileHero`, `FeaturedProducts`) never needed a live
 * region or a "lead collection" concept, since neither reads real catalog data.
 */

/**
 * Same resolution `FeaturedProducts` already does (`home/components/featured-products/
 * index.tsx`): the visitor's own region from the country-code cookie, falling back to
 * the default locale's region when the cookie is absent (first visit, no country
 * resolved yet).
 */
export async function getHomeRegion(): Promise<HttpTypes.StoreRegion | null> {
  const countryCode = await getCountryCode()
  const region = await getRegion(countryCode ?? defaultLocale)
  return region ?? null
}

const LEAD_COLLECTION_HANDLES = ["bestsellers", "the-foundation"]

/**
 * The one collection every "single collection" hero/listing variant reads from —
 * `hero.js`'s `pickHeadliner()`/`pickShelf()` and `blocks.js`'s `lead()`, both defined
 * identically: the bestsellers/foundation collection when the profile has one (three of
 * the five launch profiles do — `sneakers`, `electronics`, `bestsellers`; `supplements`
 * has `the-foundation`), else the profile's first collection (`home-goods`'s
 * `the-morning-table`, `womens-fashion`'s `autumn-edit` — neither profile names either
 * lead handle). `null` only when the profile has no collections at all (the `default`
 * profile with an empty catalog).
 */
export async function getLeadCollection(): Promise<HttpTypes.StoreCollection | null> {
  const { collections } = await listCollections({ fields: "id,handle,title" })
  if (!collections.length) {
    return null
  }
  return (
    collections.find((c) => LEAD_COLLECTION_HANDLES.includes(c.handle ?? "")) ??
    collections[0]
  )
}

/**
 * Up to `limit` priced products from `collectionId`, preferring ones with a thumbnail —
 * `blocks.js`'s `withImage()`/`inCollection()` — so a card never renders with a blank
 * frame. Falls back to the unfiltered result when fewer than four have one, the same
 * "collapse rather than leave a gap" rule the grids themselves apply (composer's own
 * `list.length >= Math.min(n, 4) ? list : withImage(p)`, inverted: here the fallback
 * widens FROM the image filter, since every launch profile's catalog is fully
 * photographed and an empty result would only mean the collection itself is short).
 */
export async function listLeadProducts({
  collectionId,
  region,
  limit,
}: {
  collectionId: string
  region: HttpTypes.StoreRegion
  limit: number
}): Promise<HttpTypes.StoreProduct[]> {
  const { response } = await listProducts({
    regionId: region.id,
    queryParams: { collection_id: collectionId, limit },
  })
  const withImage = response.products.filter((p) => !!p.thumbnail)
  return withImage.length >= Math.min(4, limit) ? withImage : response.products
}

/** Every product with an image and a price, newest-first is not tracked here — plain
 *  catalog order, same as `listProducts` returns it (creation order). Used by P2/P4,
 *  which are NOT scoped to the lead collection (`blocks.js` `group: "flat"`). `count` is
 *  the store's own total (`listProducts`' unfiltered `count`, not `products.length` after
 *  the image filter) — P2's "All {count} products" heading (`blocks.js:95`) names the
 *  whole catalog, not the page of products actually rendered. */
export async function listCatalogProducts({
  region,
  limit,
}: {
  region: HttpTypes.StoreRegion
  limit: number
}): Promise<{ products: HttpTypes.StoreProduct[]; count: number }> {
  const { response } = await listProducts({
    regionId: region.id,
    queryParams: { limit },
  })
  return {
    products: response.products.filter((p) => !!p.thumbnail),
    count: response.count,
  }
}

/**
 * Product count per top-level category, for hero J's door captions (`countIn()`,
 * `composer/lib/blocks.js:12`) — the storefront has no loader that returns this today
 * (`2026-09-09-block-port-map.md` §3, the H5/H6 count gap J shares). One `listCategories`
 * call resolves `categoryHandle` to an id, then one `listProducts` call per requested
 * handle with `limit: 1` and a trimmed `fields` reads the store API's own unfiltered
 * `count` — cheap because J only ever asks for 3 handles (`p.tiles.slice(0, 3)`).
 * A handle with no matching category (stale profile data) counts as 0 rather than
 * throwing, so one bad tile never blanks the whole hero.
 */
export async function getCategoryProductCounts({
  handles,
  region,
}: {
  handles: string[]
  region: HttpTypes.StoreRegion
}): Promise<Record<string, number>> {
  const categories = await listCategories({ fields: "id,handle" })
  const idByHandle = new Map(
    categories.filter((c) => c.handle).map((c) => [c.handle as string, c.id])
  )

  const counts = await Promise.all(
    handles.map(async (handle) => {
      const categoryId = idByHandle.get(handle)
      if (!categoryId) {
        return [handle, 0] as const
      }
      const { response } = await listProducts({
        regionId: region.id,
        queryParams: { category_id: [categoryId], limit: 1, fields: "id" },
      })
      return [handle, response.count] as const
    })
  )

  return Object.fromEntries(counts)
}

/**
 * ---- tenant panel wave 2, piece 8 --------------------------------------------------
 *
 * Which products the home listing shows, when a tenant's home-page document says so
 * (`content.products` of `upready.tenant-home/v1`). Every listing variant routes its own
 * product read through `resolveHomeListing` below, so "popular" keeps each variant's
 * existing behaviour byte for byte and "category" is implemented once rather than five
 * times (rule 20: the same pattern, fixed in one place).
 */
export type HomeProductsSource =
  | { source: "popular" }
  | { source: "category"; category_id: string; title: string }

export type HomeListingBlock = {
  /** The heading above the products, or null when the variant writes its own. */
  heading: string | null
  /** Where "see all" goes, or null when there is nowhere to send the visitor. */
  href: string | null
  products: HttpTypes.StoreProduct[]
  /** The source's own total, for the variants whose heading names a count. */
  count: number
}

/**
 * The two ways "popular" reads today, kept apart because the variants differ: P1, P3 and
 * P5 show the lead collection (`group: "lead"` in the composer's own blocks.js), P2 and P4
 * show the whole catalog (`group: "flat"`).
 */
export type HomeListingScope = "lead" | "catalog"

/**
 * Products of one category, priced for `region`. `listProducts` takes `category_id` as a
 * plain query parameter (the Store API filters on it), so this is one call; the handle
 * comes from a second, `limit: 1` category read, because the storefront routes categories
 * by handle (`/[locale]/(main)/categories/[...category]`) and the document stores an id.
 */
export async function listCategoryProducts({
  categoryId,
  region,
  limit,
}: {
  categoryId: string
  region: HttpTypes.StoreRegion
  limit: number
}): Promise<{ products: HttpTypes.StoreProduct[]; count: number; handle: string | null }> {
  const [{ response }, categories] = await Promise.all([
    listProducts({
      regionId: region.id,
      queryParams: { category_id: [categoryId], limit },
    }),
    listCategories({ id: categoryId, limit: 1, fields: "id,handle,name" }),
  ])

  const withImage = response.products.filter((p) => !!p.thumbnail)

  return {
    products: withImage.length >= Math.min(4, limit) ? withImage : response.products,
    count: response.count,
    // `listCategories` resolves to the array itself, not to the envelope.
    handle: (categories?.[0]?.handle as string | undefined) ?? null,
  }
}

/**
 * One entry point for every listing variant. `source` absent or `"popular"` reproduces the
 * variant's own behaviour; `"category"` reads that category instead and takes its heading
 * from the document (the operator's own words, which is why the heading is not derived
 * from the category name).
 *
 * Returns null when there is nothing to render — no region, no lead collection, no priced
 * product — which is the "render nothing rather than an empty band" rule every variant
 * already followed on its own.
 */
export async function resolveHomeListing({
  source,
  region,
  limit,
  scope,
}: {
  source: HomeProductsSource | undefined
  region: HttpTypes.StoreRegion
  limit: number
  scope: HomeListingScope
}): Promise<HomeListingBlock | null> {
  if (source?.source === "category") {
    const { products, count, handle } = await listCategoryProducts({
      categoryId: source.category_id,
      region,
      limit,
    })
    if (!products.length) {
      return null
    }
    return {
      heading: source.title || null,
      href: handle ? `/categories/${handle}` : null,
      products,
      count,
    }
  }

  if (scope === "catalog") {
    const { products, count } = await listCatalogProducts({ region, limit })
    if (!products.length) {
      return null
    }
    return { heading: null, href: null, products, count }
  }

  const collection = await getLeadCollection()
  if (!collection) {
    return null
  }
  const products = await listLeadProducts({ collectionId: collection.id, region, limit })
  if (!products.length) {
    return null
  }
  return {
    heading: collection.title ?? null,
    href: collection.handle ? `/collections/${collection.handle}` : null,
    products,
    count: products.length,
  }
}
