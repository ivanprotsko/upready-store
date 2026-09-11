"use server"

/**
 * The tenant's own home-page document (`upready.tenant-home/v1`,
 * `docs/tenant-panel/api-contract.md` "Piece 8"): its theme preset, the
 * block composition and the text for those blocks.
 *
 * MINIMAL LOADER, deliberately. Piece 8 owns this document and ships its own
 * `lib/data/tenant-home.ts` with the full content plumbing; it is built in a
 * different worktree and is NOT in this tree, so piece 9 reads the same public
 * route through its own loader rather than inventing a second contract. When
 * the two meet, piece 8's file is the one to keep — this one only reads the
 * `settings` half, which is all `(main)/page.tsx` needs to compose the blocks.
 *
 * Not locale-scoped: one document per shop for every language, the same reason
 * `storefront-settings.ts` uses `fetchWithoutLocale` (AGENTS.md, "Two pieces of
 * locale plumbing").
 *
 * The cache tag carries the shop's handle, so revalidating one shop's home page
 * leaves every other shop on this process alone.
 */

import { fetchWithoutLocale } from "@lib/config"
import { getTenantHandle } from "@lib/data/cookies"
import { tenantHomeTag } from "@lib/tenant/cache-tags"
import type { StorefrontSettings } from "@lib/theme/composition"

export type TenantHome = {
  schema?: string
  theme?: { preset?: string } | null
  settings?: StorefrontSettings | null
  content?: Record<string, unknown> | null
  updatedAt?: string
}

let warnedRouteMissing = false
let warnedUnreachable = false

export async function getTenantHome(): Promise<TenantHome | null> {
  const handle = await getTenantHandle()

  // Single-store mode: no shop was resolved from the Host, so there is no
  // per-shop document to read and the site-wide one still applies.
  if (!handle) {
    return null
  }

  try {
    const { home } = await fetchWithoutLocale<{ home: TenantHome | null }>(
      "/store/tenant/home",
      { next: { tags: [tenantHomeTag(handle)] }, cache: "force-cache" }
    )

    return home ?? null
  } catch (error) {
    // A 404 here is not "this shop saved nothing" — it is the route itself
    // being absent, which is the state of this worktree until piece 8 merges.
    // Saying so once, loudly, is the difference between a known gap and a home
    // page that silently looks unconfigured for every shop (rule 20a).
    const status = (error as { status?: number })?.status

    if (status === 404) {
      if (!warnedRouteMissing) {
        warnedRouteMissing = true
        console.error(
          "getTenantHome: GET /store/tenant/home answered 404. The route is piece 8 of the tenant-panel wave and is not in this checkout; every shop falls back to the site-wide composition document until it merges."
        )
      }

      return null
    }

    if (!warnedUnreachable) {
      warnedUnreachable = true
      console.error("getTenantHome: cannot read the shop's home document", error)
    }

    return null
  }
}
