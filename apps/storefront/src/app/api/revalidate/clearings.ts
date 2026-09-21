/**
 * What every revalidation event clears: the one list the webhook in `route.ts`
 * reads. It lives outside `route.ts` because a Next route file may export only
 * its handlers, and the tests have to read this table.
 *
 * An event with no entry here answers `revalidated: true` and clears nothing,
 * which is how a renamed product type once stayed on the storefront until the
 * process restarted. `clearings.test.ts` reads the event names the backend
 * sends and fails when one of them has no entry.
 *
 * The catalog tags are suffixed with the visitor's own `_medusa_cache_id`
 * cookie (`lib/data/cookies.ts`), so `revalidateTag("products")` matches no
 * catalog fetch and the PATHS are what clears a catalog page. The sitemap and
 * llms.txt read the bare tags.
 */

export type ClearedPath = [path: string, kind?: "page" | "layout"]

export type Clearing = {
  tags: string[]
  paths: ClearedPath[]
}

const PRODUCT: ClearedPath = ["/[locale]/(main)/products/[handle]", "page"]
const STORE: ClearedPath = ["/[locale]/(main)/store", "page"]
const CATEGORY: ClearedPath = [
  "/[locale]/(main)/categories/[...category]",
  "page",
]
const COLLECTION: ClearedPath = [
  "/[locale]/(main)/collections/[handle]",
  "page",
]
// The shop's HOME page shows category tiles and a product listing, so a catalog
// change has to clear it too. Measured 2026-09-14 on the live stand: renaming a
// tile category to «Шары» and replacing its picture answered status=200 and the
// home page still served the old tile five reloads later, because the paths
// listed every catalog page EXCEPT the one the storefront opens on.
const HOME: ClearedPath = ["/[locale]/(main)", "page"]
// The `(main)` layout holds the header, the footer and the navigation, and every
// route under the group re-renders with it.
const LAYOUT: ClearedPath = ["/[locale]/(main)", "layout"]
const LLMS: ClearedPath = ["/llms.txt"]
const SITEMAP: ClearedPath = ["/sitemap.xml"]

const CATALOG_PAGES: ClearedPath[] = [
  PRODUCT,
  STORE,
  CATEGORY,
  COLLECTION,
  HOME,
]

const product: Clearing = {
  tags: ["products"],
  paths: [...CATALOG_PAGES, LLMS, SITEMAP],
}

// Stock. The product list caches `+variants.inventory_quantity`, which is the
// stocked amount minus the reservations, so a level edited in the Admin and a
// reservation made by a placed order both change what these pages show. These
// are Medusa's workflow events, the ones the backend subscriber
// `inventory-updated.ts` forwards. The sitemap and llms.txt hold no stock, and
// a reservation comes with every order, so they stay.
const stock: Clearing = {
  tags: ["products"],
  paths: CATALOG_PAGES,
}

const category: Clearing = {
  tags: ["categories"],
  paths: [...CATALOG_PAGES, LLMS, SITEMAP],
}

const collection: Clearing = {
  tags: ["collections"],
  paths: [COLLECTION, STORE, HOME, LLMS, SITEMAP],
}

const translation: Clearing = {
  tags: ["products", "categories", "collections"],
  paths: [...CATALOG_PAGES, LLMS, SITEMAP],
}

const forEachVerb = (
  names: string[],
  clearing: Clearing
): Record<string, Clearing> =>
  Object.fromEntries(
    names.flatMap((name) =>
      ["created", "updated", "deleted"].map((verb) => [
        `${name}.${verb}`,
        clearing,
      ])
    )
  )

export const CLEARINGS: Record<string, Clearing> = {
  // The backend subscriber `product-updated.ts` has always sent the three
  // product type events, and the list once had no entry for them.
  ...forEachVerb(
    [
      "product",
      "product-variant",
      "product-type",
      "product-tag",
      "product-option",
    ],
    product
  ),
  ...forEachVerb(["inventory-level", "reservation-item"], stock),
  ...forEachVerb(["product-category"], category),
  ...forEachVerb(["product-collection"], collection),
  ...forEachVerb(["translation"], translation),

  // tenant-panel wave 2, piece 7: the tenant's content pages. One shared cache
  // tag (`lib/data/tenant-pages.ts`), so clearing it clears both the page bodies
  // and the footer's link list; the footer lives in the `(main)` layout.
  "tenant.pages": {
    tags: ["tenant-pages"],
    paths: [["/[locale]/(main)/pages/[key]", "page"], LAYOUT],
  },

  // t15-product-attributes: the shop's own product characteristics. One shared
  // tag (`lib/data/product-attributes.ts`) carries BOTH reads — the block on a
  // product page and the facets of the catalogue — because the owner's edit
  // changes them together: renaming «Объём» renames the filter, and filling a
  // value moves a product in and out of a facet count. The paths are every
  // catalogue surface the filter bar stands on plus the product page itself.
  "tenant.product-attributes": {
    tags: ["product-attributes"],
    paths: [PRODUCT, STORE, CATEGORY],
  },

  // tenant panel wave 2, piece 8: the tenant's home-page document
  // (`GET /store/tenant/home`, cache tag "tenant-home"). It decides the theme,
  // the composition and the home blocks, so clearing it has to redraw the root
  // layout as well as the home page itself — every route under `(main)` reads
  // the same document through `getEffectiveSettings()` for its header and
  // footer. The route adds `tenant-home-<handle>` when the call names a shop.
  "tenant.home": {
    tags: ["tenant-home"],
    paths: [LAYOUT, HOME],
  },

  // t09-reviews: the shop's product reviews. The list and the average the
  // product page shows come from one fetch with the shared `product-reviews`
  // tag, and the moderation act that changes them happens in the PANEL, not on
  // the storefront — so without this the owner publishes a review and the page
  // keeps showing the old list and the old average until the cache entry ages
  // out. Measured on the stand 2026-09-15: the API answered «3 отзыва, 4.7»
  // while the page still read «5 из 5 · 2 отзыва». The product page also
  // carries the rating next to the title and the `aggregateRating` in its
  // JSON-LD, so the path goes with the tag.
  "tenant.reviews": {
    tags: ["product-reviews"],
    paths: [PRODUCT],
  },

  // t10-blog: the shop's journal. One shared cache tag
  // (`lib/data/tenant-articles.ts`) carries the feed, every article page, the
  // «does this shop have a journal» check the navigation reads, and the
  // sitemap's article list — so clearing it clears all four. The `(main)`
  // LAYOUT is in the list because the navigation's Journal link lives there,
  // and publishing a shop's FIRST article has to make that link appear without
  // a rebuild.
  "tenant.articles": {
    tags: ["tenant-articles"],
    paths: [
      ["/[locale]/(main)/journal", "page"],
      ["/[locale]/(main)/journal/[slug]", "page"],
      LAYOUT,
      SITEMAP,
    ],
  },
}
