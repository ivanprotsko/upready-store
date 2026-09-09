import { categoryTiles, profile } from "@lib/profile"
import { listCategories } from "@lib/data/categories"

/**
 * Shared slide data for hero GA (carousel) and GB (stripes) — both composer variants read
 * the same `slides()` helper (`artifacts/docs/composer/lib/blocks.js:278`,
 * `p.tiles.slice(0, 5).map(...)`), so this file is the storefront equivalent, kept as one
 * source both `hero-ga.tsx` and `hero-gb.tsx` import rather than duplicated.
 *
 * `label`/`image` come from the build-time profile (`@lib/profile`, `categoryTiles`), the
 * same source `CategoryTiles` already reads. `count` is a live per-request read, since the
 * storefront has no build-time product count — block-port-map.md §3/§4 flags this same gap
 * for header H5/H6 and hero J, and it applies here too (composer's `countIn()`,
 * `blocks.js:12`). `listCategories()` already asks the backend to expand `*products` on
 * every category (`lib/data/categories.ts:18`, used unchanged by nav H1 and Footer today),
 * so this reuses that loader rather than adding a new one — no new shared file, per this
 * package's own scope. `category.products.length` is therefore an approximation bounded by
 * whatever limit the backend's relation expansion applies, not an authoritative total the
 * way a `count` field from `/store/products?category_id=…` would be — good enough for a
 * decorative "N products" line on a hero slide, not for anything transactional. Flagged as
 * a fork in this package's report: the eventual category-count loader (block-port-map.md's
 * W10) should replace this call once it exists, the way `nav/variants/index.ts` documents
 * every placeholder entry as something a later package replaces.
 */

export type GallerySlide = {
  categoryHandle: string
  label: string
  image: string | null
  count: number | null
}

/** Composer's own `roles` constraint for the whole gallery family: "≥ 3 slides"
 *  (`blocks.js:207`) — fewer categories than that and neither GA nor GB has enough content
 *  to be a gallery, so both fall back to no hero at all, the way `ProfileHero` already
 *  returns null for a profile with nothing to show. */
const MIN_SLIDES = 3
/** Composer caps at 5 (`blocks.js:278`, `p.tiles.slice(0, 5)`); GB's own filter additionally
 *  warns strips stop reading past 6 (`blocks.js:213`), so 5 stays under both ceilings. */
const MAX_SLIDES = 5

export const galleryBrandName = profile.brand?.name ?? null

export async function getGallerySlides(): Promise<GallerySlide[] | null> {
  const tiles = categoryTiles.slice(0, MAX_SLIDES)
  if (tiles.length < MIN_SLIDES) {
    return null
  }

  const counts = await listCategories({ fields: "handle,*products" })
    .then((categories) => {
      const map = new Map<string, number>()
      for (const category of categories) {
        if (category.handle) {
          map.set(category.handle, category.products?.length ?? 0)
        }
      }
      return map
    })
    .catch(() => new Map<string, number>())

  return tiles.map((tile) => ({
    categoryHandle: tile.categoryHandle,
    label: tile.label,
    image: tile.image,
    count: counts.get(tile.categoryHandle) ?? null,
  }))
}
