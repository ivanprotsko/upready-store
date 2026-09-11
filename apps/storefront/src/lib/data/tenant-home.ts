"use server"

/**
 * Read path for the tenant's home-page document, `upready.tenant-home/v1`
 * (`docs/tenant-panel/api-contract.md`, "Piece 8"). One document per tenant, written from
 * the tenant panel's `/home-settings` screen and served to this storefront by
 * `GET /store/tenant/home`, which resolves the tenant from the publishable key this
 * storefront already sends — there is no tenant id in the request and none to pass.
 *
 * Not locale-scoped: one document for every language, the same as the site-wide
 * composition document it extends, so this calls `fetchWithoutLocale` rather than the
 * locale-aware `sdk.client.fetch` (AGENTS.md, "Two pieces of locale plumbing"). Its own
 * cache tag is `"tenant-home"`, cleared by `POST /api/revalidate` with
 * `{ "type": "tenant.home" }`.
 *
 * `getTenantHome()` is deliberately the ONE place the document is read. Piece 9
 * (storefront by host) replaces its body with a read of the request headers the
 * middleware resolves per host; every consumer below goes through this module, so that
 * swap touches this file alone.
 *
 * A single-store install (the platform's own key, no tenant behind it) answers 404 here.
 * That is the normal state of the five old stands, not an error: the loader returns null
 * and every consumer falls back to `getStorefrontSettings()` and the profile, exactly as
 * before this piece existed.
 */

import { fetchWithoutLocale } from "@lib/config"
import { getStorefrontSettings } from "@lib/data/storefront-settings"
import type { StorefrontSettings, StorefrontSettingsInput } from "@lib/theme/composition"

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
 * The tenant's saved document, or null when this storefront's key has no tenant behind it
 * (single-store mode) or the tenant never saved one. Never throws into a page render: a
 * backend that cannot be reached logs once per server process and reads as "no document",
 * which every consumer already has a defined fallback for (rule 20 — tolerating a failure
 * is not the same as hiding it).
 */
export async function getTenantHome(): Promise<TenantHome | null> {
  try {
    const { home } = await fetchWithoutLocale<{ home: TenantHome | null }>(
      "/store/tenant/home",
      { next: { tags: [HOME_TAG] }, cache: "force-cache" }
    )
    return home ?? null
  } catch (error) {
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
 * The theme preset the tenant picked, or null. Kept here rather than read from the
 * document at the call site so piece 9's header swap has one place to change; the caller
 * still checks it against the generated `THEME_IDS` before it reaches `data-theme`,
 * because this value crosses the wire as a plain string.
 */
export async function getTenantThemePreset(): Promise<string | null> {
  const home = await getTenantHome()
  return home?.theme?.preset ?? null
}
