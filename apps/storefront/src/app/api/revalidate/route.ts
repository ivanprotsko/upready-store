import { tenantHomeTag } from "@lib/tenant/cache-tags"
import { revalidatePath, revalidateTag } from "next/cache"
import { type NextRequest, NextResponse } from "next/server"

/**
 * One storefront process now serves every shop (piece 9,
 * docs/multitenancy/storefront-by-host.md §2), so this webhook takes an optional
 * `handle` naming whose data changed.
 *
 * What it can and cannot narrow, measured rather than assumed:
 *  - `tenant.home` clears `tenant-home-<handle>` — that tag carries the handle
 *    and nothing else, so exactly one shop's home document is dropped.
 *  - the catalog tags cannot be narrowed from here, and never could: every one
 *    of them is suffixed with the visitor's own `_medusa_cache_id` cookie
 *    (`lib/data/cookies.ts`), so `revalidateTag("products")` has matched
 *    nothing since that suffix was introduced, before this piece. The
 *    `revalidatePath` calls below are what actually clears a catalog page, and
 *    a path is one path for every shop on the process — over-invalidation, not
 *    a leak: the fetch cache key includes the request headers, so the
 *    per-shop `x-publishable-api-key` already keeps two shops' responses apart
 *    (next/dist/server/lib/incremental-cache/index.js, generateCacheKey).
 *
 * The route sits under /api, which `middleware.ts`'s matcher excludes, so there
 * are no `x-tenant-*` headers here: the handle has to come from the body.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-revalidate-secret")

  if (
    process.env.REVALIDATE_SECRET &&
    secret !== process.env.REVALIDATE_SECRET
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()

  if (
    body.type === "product.updated" ||
    body.type === "product.created" ||
    body.type === "product.deleted" ||
    body.type === "product-variant.updated" ||
    body.type === "product-variant.created" ||
    body.type === "product-variant.deleted" ||
    // The backend subscriber has always sent the three product type events,
    // and this list had no entry for them, so a renamed type stayed on the
    // storefront until the process restarted.
    body.type === "product-type.updated" ||
    body.type === "product-type.created" ||
    body.type === "product-type.deleted" ||
    body.type === "product-tag.updated" ||
    body.type === "product-tag.created" ||
    body.type === "product-tag.deleted" ||
    body.type === "product-option.updated" ||
    body.type === "product-option.created" ||
    body.type === "product-option.deleted"
  ) {
    revalidateTag("products")
    revalidatePath(`/[locale]/(main)/products/[handle]`, "page")
    revalidatePath(`/[locale]/(main)/store`, "page")
    revalidatePath(`/[locale]/(main)/categories/[...category]`, "page")
    revalidatePath(`/[locale]/(main)/collections/[handle]`, "page")
    // The shop's HOME page shows category tiles and a product listing, so a
    // catalog change has to clear it too. Measured 2026-09-14 on the live stand:
    // renaming a tile category to «Шары» and replacing its picture answered
    // status=200 here and the home page still served the old tile five reloads
    // later — the paths below listed every catalog page EXCEPT the one the
    // storefront opens on.
    revalidatePath("/[locale]/(main)", "page")
    revalidatePath("/llms.txt")
    revalidatePath("/sitemap.xml")
  }

  // Stock. The product list caches `+variants.inventory_quantity`, which is the
  // stocked amount minus the reservations, so a level edited in the Admin and a
  // reservation made by a placed order both change what these pages show. These
  // are Medusa's workflow events, the ones the backend subscriber
  // `inventory-updated.ts` forwards. The sitemap and llms.txt hold no stock, and
  // a reservation comes with every order, so they stay.
  if (
    body.type === "inventory-level.created" ||
    body.type === "inventory-level.updated" ||
    body.type === "inventory-level.deleted" ||
    body.type === "reservation-item.created" ||
    body.type === "reservation-item.updated" ||
    body.type === "reservation-item.deleted"
  ) {
    revalidateTag("products")
    revalidatePath(`/[locale]/(main)/products/[handle]`, "page")
    revalidatePath(`/[locale]/(main)/store`, "page")
    revalidatePath(`/[locale]/(main)/categories/[...category]`, "page")
    revalidatePath(`/[locale]/(main)/collections/[handle]`, "page")
    revalidatePath("/[locale]/(main)", "page")
  }

  if (
    body.type === "product-category.updated" ||
    body.type === "product-category.created" ||
    body.type === "product-category.deleted"
  ) {
    revalidateTag("categories")
    revalidatePath(`/[locale]/(main)/products/[handle]`, "page")
    revalidatePath(`/[locale]/(main)/store`, "page")
    revalidatePath(`/[locale]/(main)/categories/[...category]`, "page")
    revalidatePath(`/[locale]/(main)/collections/[handle]`, "page")
    revalidatePath("/[locale]/(main)", "page")
    revalidatePath("/llms.txt")
    revalidatePath("/sitemap.xml")
  }

  if (
    body.type === "product-collection.updated" ||
    body.type === "product-collection.created" ||
    body.type === "product-collection.deleted"
  ) {
    revalidateTag("collections")
    revalidatePath(`/[locale]/(main)/collections/[handle]`, "page")
    revalidatePath(`/[locale]/(main)/store`, "page")
    revalidatePath("/[locale]/(main)", "page")
    revalidatePath("/llms.txt")
    revalidatePath("/sitemap.xml")
  }

  if (
    body.type === "translation.created" ||
    body.type === "translation.updated" ||
    body.type === "translation.deleted"
  ) {
    revalidateTag("products")
    revalidateTag("categories")
    revalidateTag("collections")
    revalidatePath(`/[locale]/(main)/products/[handle]`, "page")
    revalidatePath(`/[locale]/(main)/store`, "page")
    revalidatePath(`/[locale]/(main)/categories/[...category]`, "page")
    revalidatePath(`/[locale]/(main)/collections/[handle]`, "page")
    revalidatePath("/[locale]/(main)", "page")
    revalidatePath("/llms.txt")
    revalidatePath("/sitemap.xml")
  }

  // tenant-panel wave 2, piece 7: the tenant's content pages. One shared cache
  // tag (`lib/data/tenant-pages.ts`), so clearing it clears both the page bodies
  // and the footer's link list; the two paths below are the rendered pages that
  // hold them — the footer lives in the `(main)` layout, which every route under
  // the group re-renders with.
  if (body.type === "tenant.pages") {
    revalidateTag("tenant-pages")
    revalidatePath(`/[locale]/(main)/pages/[key]`, "page")
    revalidatePath(`/[locale]/(main)`, "layout")
  }

  // tenant panel wave 2, piece 8: the tenant's home-page document
  // (`GET /store/tenant/home`, cache tag "tenant-home"). It decides the theme, the
  // composition and the home blocks, so clearing it has to redraw the root layout as well
  // as the home page itself — every route under `(main)` reads the same document through
  // `getEffectiveSettings()` for its header and footer, which is why the paths below are
  // the layout ones and not only `/`.
  //
  // Piece 9 added the optional `handle`. `getTenantHome()` attaches BOTH tags to its
  // fetch — the shared one and `tenant-home-<handle>` — so a caller that names no shop
  // still clears every shop's document the way it did before, and a caller that names one
  // drops that shop's alone instead of twenty others' with it. The paths cannot be
  // narrowed either way: a path is one path for every shop on the process, which is
  // over-invalidation and not a leak (the fetch cache key carries the per-shop
  // `x-publishable-api-key`).
  // t15-product-attributes: the shop's own product characteristics. One shared
  // tag (`lib/data/product-attributes.ts`) carries BOTH reads — the block on a
  // product page and the facets of the catalogue — because the owner's edit
  // changes them together: renaming «Объём» renames the filter, and filling a
  // value moves a product in and out of a facet count. The paths are every
  // catalogue surface the filter bar stands on plus the product page itself.
  if (body.type === "tenant.product-attributes") {
    revalidateTag("product-attributes")
    revalidatePath(`/[locale]/(main)/products/[handle]`, "page")
    revalidatePath(`/[locale]/(main)/store`, "page")
    revalidatePath(`/[locale]/(main)/categories/[...category]`, "page")
  }

  if (body.type === "tenant.home") {
    revalidateTag("tenant-home")

    if (typeof body.handle === "string" && body.handle) {
      revalidateTag(tenantHomeTag(body.handle))
    }

    revalidatePath("/[locale]/(main)", "layout")
    revalidatePath("/[locale]/(main)", "page")
  }

  // t09-reviews: the shop's product reviews. The list and the average the
  // product page shows come from one fetch with the shared `product-reviews`
  // tag, and the moderation act that changes them happens in the PANEL, not on
  // the storefront — so without this the owner publishes a review and the page
  // keeps showing the old list and the old average until the cache entry ages
  // out. Measured on the stand 2026-09-15: the API answered «3 отзыва, 4.7»
  // while the page still read «5 из 5 · 2 отзыва».
  //
  // The product page is also the page that carries the rating next to the title
  // and the `aggregateRating` in its JSON-LD, so the path goes with the tag.
  if (body.type === "tenant.reviews") {
    revalidateTag("product-reviews")
    revalidatePath(`/[locale]/(main)/products/[handle]`, "page")
  }

  // t10-blog: the shop's journal. One shared cache tag
  // (`lib/data/tenant-articles.ts`) carries the feed, every article page, the
  // «does this shop have a journal» check the navigation reads, and the
  // sitemap's article list — so clearing it clears all four. The paths below
  // are the rendered pages that hold them; the `(main)` LAYOUT is in the list
  // because the navigation's Journal link lives there, and publishing a shop's
  // FIRST article has to make that link appear without a rebuild.
  if (body.type === "tenant.articles") {
    revalidateTag("tenant-articles")
    revalidatePath(`/[locale]/(main)/journal`, "page")
    revalidatePath(`/[locale]/(main)/journal/[slug]`, "page")
    revalidatePath(`/[locale]/(main)`, "layout")
    revalidatePath("/sitemap.xml")
  }

  return NextResponse.json({ revalidated: true })
}
