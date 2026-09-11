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
    revalidatePath("/llms.txt")
    revalidatePath("/sitemap.xml")
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
    revalidatePath("/llms.txt")
    revalidatePath("/sitemap.xml")
  }

  if (body.type === "tenant.home" && typeof body.handle === "string" && body.handle) {
    revalidateTag(tenantHomeTag(body.handle))
    revalidatePath(`/[locale]/(main)`, "page")
  }

  return NextResponse.json({ revalidated: true })
}
