"use server"

/**
 * Read path for the tenant's home-page document, `upready.tenant-home/v1`
 * (`docs/tenant-panel/api-contract.md`, "Piece 8"). One document per tenant, written from
 * the tenant panel's `/home-settings` screen and served to this storefront by
 * `GET /store/tenant/home`, which resolves the tenant from the publishable key this
 * storefront sends.
 *
 * MERGE OF PIECES 8 AND 9. Piece 8 wrote this module and predicted its own successor:
 * "Piece 9 moves this read to the request headers the by-host middleware sets, which is
 * why it goes through `lib/data/tenant-home.ts` and not straight to the document." That is
 * what happened, in three places:
 *
 *   1. The key is per REQUEST, not per process. `fetchWithoutLocale` attaches
 *      `x-publishable-api-key` from the `x-tenant-key` request header that
 *      `src/middleware.ts` resolved from the `Host`, with the env key as the single-store
 *      fallback (`lib/config.ts`). So one storefront process asks this route once per
 *      shop and gets each shop's own document, with no change at the call sites.
 *   2. The cache tag carries the shop's handle as well as the shared one, so clearing one
 *      shop's home page leaves the other shops on the process alone. Both tags are
 *      attached, so `POST /api/revalidate {"type":"tenant.home"}` without a handle still
 *      clears every shop's document the way it did before piece 9.
 *   3. `getTenantThemePreset()` prefers the `x-tenant-theme` request header, which is the
 *      same value read from the same document by `GET /storefront/by-host` — see the note
 *      on that function for why, and for the staleness window it costs.
 *
 * Not locale-scoped: one document for every language, the same as the site-wide
 * composition document it extends, so this calls `fetchWithoutLocale` rather than the
 * locale-aware `sdk.client.fetch` (AGENTS.md, "Two pieces of locale plumbing").
 *
 * A single-store install (the platform's own key, no tenant behind it) answers 404 here.
 * That is the normal state of the five old stands, not an error: the loader returns null
 * and every consumer falls back to `getStorefrontSettings()` and the profile, exactly as
 * before this piece existed.
 */

import { fetchWithoutLocale } from "@lib/config"
import { getStorefrontSettings } from "@lib/data/storefront-settings"
import { getTenantHandle } from "@lib/data/cookies"
import { tenantHomeTag } from "@lib/tenant/cache-tags"
import type { StorefrontSettings, StorefrontSettingsInput } from "@lib/theme/composition"
import { headers as nextHeaders } from "next/headers"

export type HomeBlock = "hero" | "categories" | "products"

export type TenantHeroContent = {
  title: string
  subtitle: string
  cta_label: string
  cta_href: string
  image_url: string | null
}

export type TenantProductsContent =
  | { source: "popular" }
  | { source: "category"; category_id: string; title: string }

export type TenantHome = {
  schema: string
  theme: { preset: string }
  settings: StorefrontSettingsInput
  content: {
    hero: TenantHeroContent
    products: TenantProductsContent
    order: HomeBlock[]
  }
  updatedAt: string
}

const HOME_TAG = "tenant-home"

let warnedUnreachable = false

/**
 * The tenant's saved document, or null when this request's key has no tenant behind it
 * (single-store mode) or the tenant never saved one. Never throws into a page render: a
 * backend that cannot be reached logs once per server process and reads as "no document",
 * which every consumer already has a defined fallback for (rule 20 — tolerating a failure
 * is not the same as hiding it).
 *
 * A 404 is the answer, not a failure: it is what a key with no tenant behind it gets, and
 * it must stay quiet or every request of every single-store stand writes a log line.
 */
export async function getTenantHome(): Promise<TenantHome | null> {
  const handle = await getTenantHandle()

  // Both tags, always. The shared one keeps piece 8's webhook working for a caller that
  // names no shop; the handle-scoped one is what `POST /api/revalidate` clears when it
  // does, so one shop's save does not drop twenty other shops' cached home pages.
  const tags = handle ? [HOME_TAG, tenantHomeTag(handle)] : [HOME_TAG]

  try {
    const { home } = await fetchWithoutLocale<{ home: TenantHome | null }>(
      "/store/tenant/home",
      { next: { tags }, cache: "force-cache" }
    )
    return home ?? null
  } catch (error) {
    if ((error as { status?: number })?.status === 404) {
      return null
    }

    if (!warnedUnreachable) {
      warnedUnreachable = true
      console.error(
        "getTenantHome: /store/tenant/home did not answer; falling back to the stand's own settings",
        error
      )
    }
    return null
  }
}

/**
 * The composition every site-wide consumer reads — the nav, the footer, the `(main)`
 * layout and the root layout. The tenant's own document wins when it exists; otherwise
 * this is `getStorefrontSettings()` unchanged, which is what those consumers called
 * directly before this piece.
 *
 * Both reads are `force-cache` fetches with their own tags, so calling this from several
 * components of one request costs no extra round trip (Next's fetch request memoization).
 */
export async function getEffectiveSettings(): Promise<StorefrontSettings | null> {
  const home = await getTenantHome()
  if (home) {
    return { ...home.settings, updatedAt: home.updatedAt }
  }
  return getStorefrontSettings()
}

/**
 * The theme preset the tenant picked, or null. Kept here rather than read at the call site
 * so there is one place the source can change; the caller still checks it against the
 * generated `THEME_IDS` before it reaches `data-theme`, because this value crosses the
 * wire as a plain string.
 *
 * The request header comes first. It is the SAME field of the SAME document — the by-host
 * resolver reads `tenant_home_config.config.theme.preset` and hands it to the middleware
 * (`docs/multitenancy/storefront-by-host.md` §2) — so the two never disagree about which
 * shop they describe, only about how fresh they are. Preferring the header buys two
 * things: the theme is right even when `/store/tenant/home` is unreachable, because the
 * resolver already answered before the page began rendering; and it costs no round trip in
 * the layout. It costs a staleness window of up to 60 seconds after a tenant changes its
 * preset, which is the resolver cache's TTL and heals itself, against a tagged fetch cache
 * that only clears when the revalidate webhook fires.
 *
 * With no tenant on the host the header is absent and this is piece 8's read, unchanged.
 */
export async function getTenantThemePreset(): Promise<string | null> {
  try {
    const requestHeaders = await nextHeaders()
    const fromHost = requestHeaders.get("x-tenant-theme")

    if (fromHost) {
      return fromHost
    }
  } catch {}

  const home = await getTenantHome()
  return home?.theme?.preset ?? null
}

/**
 * The light/dark default this request should paint with, before the visitor's own stored
 * choice overrides it in the browser. Same ordering and the same reasoning as
 * `getTenantThemePreset()`: the `x-tenant-mode` header is the resolver's copy of
 * `settings.defaultMode` from this shop's document.
 *
 * Null means "nobody has an opinion for this request", and the root layout then falls
 * through to the site-wide composition document and finally to the build profile.
 */
export async function getTenantModeDefault(): Promise<string | null> {
  try {
    const requestHeaders = await nextHeaders()
    return requestHeaders.get("x-tenant-mode")
  } catch {
    return null
  }
}
