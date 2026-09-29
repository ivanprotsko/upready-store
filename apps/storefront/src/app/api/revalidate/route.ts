import { tenantHomeTag } from "@lib/tenant/cache-tags"
import { timingSafeEqual } from "node:crypto"
import { revalidatePath, revalidateTag } from "next/cache"
import { type NextRequest, NextResponse } from "next/server"

import { CLEARINGS } from "./clearings"

/**
 * Constant-time compare (46df A-16): `secret !== process.env.REVALIDATE_SECRET` leaks the length
 * of the match through timing (`!==` on strings of different length returns after the first
 * differing byte position, `===` on equal-length strings scans the whole thing either way — V8's
 * own string comparison is not constant-time). `timingSafeEqual` requires equal-length buffers,
 * so a length mismatch is checked first, itself in the open (the SECRET's length is not the
 * secret) rather than by padding, which would just move the leak.
 */
const secretsMatch = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

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
  const configuredSecret = process.env.REVALIDATE_SECRET

  // 46df A-16: an unset REVALIDATE_SECRET used to mean "open to anyone" (the `&&` short-circuited
  // the whole check). In production that is a real cache-poisoning surface — anyone can clear a
  // shop's pages on demand. Refuse instead of falling open; outside production (a template clone,
  // a dev stand) an unset secret still means "not configured yet", same as before.
  if (!configuredSecret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "REVALIDATE_SECRET is not configured" },
        { status: 503 }
      )
    }
  } else {
    const secret = req.headers.get("x-revalidate-secret") ?? ""
    if (!secretsMatch(secret, configuredSecret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const body = await req.json()

  // One list says what every event clears: `./clearings.ts`. An event that is
  // not in it clears nothing and still answers 200.
  const clearing =
    typeof body.type === "string" && Object.hasOwn(CLEARINGS, body.type)
      ? CLEARINGS[body.type]
      : undefined

  if (clearing) {
    clearing.tags.forEach((tag) => revalidateTag(tag))

    // Piece 9 added the optional `handle`. `getTenantHome()` attaches BOTH tags
    // to its fetch — the shared one and `tenant-home-<handle>` — so a caller
    // that names no shop still clears every shop's document the way it did
    // before, and a caller that names one drops that shop's alone instead of
    // twenty others' with it. The paths cannot be narrowed either way: a path
    // is one path for every shop on the process.
    if (
      body.type === "tenant.home" &&
      typeof body.handle === "string" &&
      body.handle
    ) {
      revalidateTag(tenantHomeTag(body.handle))
    }

    clearing.paths.forEach((path) => revalidatePath(...path))
  }

  return NextResponse.json({ revalidated: true })
}
