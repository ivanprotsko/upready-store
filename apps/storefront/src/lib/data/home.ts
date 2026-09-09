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
