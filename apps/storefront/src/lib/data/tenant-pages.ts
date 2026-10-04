"use server"

/**
 * Read path for the tenant's content pages — the five sections a shop owner
 * fills in from the tenant panel (Contacts, Legal details, About the shop,
 * Privacy policy, Public offer) and this storefront renders under
 * `/<locale>/pages/<key>` and links from its footer.
 *
 * Contract: `docs/tenant-panel/api-contract.md`, "Piece 7: content pages". The
 * backend answers only the PUBLISHED pages of the tenant behind this
 * storefront's publishable key; a draft, an unwritten page and a neighbouring
 * tenant's page are all the same 404 here, on purpose.
 *
 * Locale-scoped since the Cherkashina migration (2026-09-12): the request goes
 * through the locale-aware `sdk.client.fetch` (it sends `x-medusa-locale`) and
 * repeats the locale as `?locale=`, so the Next fetch cache holds one entry per
 * language behind the shared tag. The backend answers the visitor's locale when
 * that row exists and falls back (language part → `en` → any locale), which is
 * what a shop whose default language is not English needs to be readable at
 * all — before this it served the `en` row to every visitor.
 *
 * One shared cache tag, `"tenant-pages"`, cleared for everyone at once by
 * `POST /api/revalidate` with `{ "type": "tenant.pages" }`.
 */

import { sdk, fetchWithoutLocale } from "@lib/config"
import { siteWideRead } from "./site-wide"
import { getLocale } from "./locale-actions"
import { defaultLocale } from "@i18n/config"

const PAGES_TAG = "tenant-pages"

export type TenantPageLink = { key: string; title: string; locale: string }

export type TenantPage = {
  id: string | null
  key: string
  locale: string
  title: string
  body: string
  published: boolean
  seo_title: string | null
  seo_description: string | null
}

let warnedUnreachable = false

/**
 * Never throw into a layout render over a footer link list: a backend that is
 * down must not take the whole storefront with it. The failure still surfaces
 * in the server log (rule 20 — tolerating is not hiding), once per server
 * process, and the footer simply renders its other columns.
 *
 * A single-store install whose key has no tenant behind it answers 404 here,
 * which is not a failure at all: it means this storefront has no tenant pages,
 * and an empty list is the right answer.
 */
export async function listTenantPages(): Promise<TenantPageLink[]> {
  try {
    const locale = (await getLocale()) ?? defaultLocale
    const { pages } = await sdk.client.fetch<{ pages: TenantPageLink[] }>(
      `/store/tenant/pages?locale=${encodeURIComponent(locale)}`,
      { next: { tags: [PAGES_TAG] }, cache: "force-cache" }
    )
    return pages ?? []
  } catch (error) {
    if (!warnedUnreachable) {
      warnedUnreachable = true
      console.error(
        "listTenantPages: /store/tenant/pages did not answer; the footer renders without the Information links",
        error
      )
    }
    return []
  }
}

/**
 * One page by key, or `null` when it is not published for this storefront's
 * tenant. The caller renders a 404 for `null`; it must not tell a visitor
 * whether the page exists as a draft.
 */
export async function getTenantPage(key: string): Promise<TenantPage | null> {
  try {
    const locale = (await getLocale()) ?? defaultLocale
    const { page } = await sdk.client.fetch<{ page: TenantPage }>(
      `/store/tenant/pages/${encodeURIComponent(key)}?locale=${encodeURIComponent(locale)}`,
      { next: { tags: [PAGES_TAG] }, cache: "force-cache" }
    )
    return page ?? null
  } catch {
    return null
  }
}

/**
 * Every page key this tenant has PUBLISHED, footer-linked or not, for the legal
 * links a buyer meets outside the footer (`@lib/util/legal-links`): the consent
 * sentence under the Pay button, the checkout footer, the account screens.
 *
 * `listTenantPages` above is the wrong source for that decision — it answers
 * the footer's own list, `in_footer: true` only, so an offer the owner
 * published without putting it in the footer would read here as "this shop has
 * no offer" and the checkout would fall back to the starter placeholder. The
 * sitemap endpoint is already the unfiltered one (t11-seo-redirects step 3, one
 * row per key per locale) and shares this module's cache tag, so this costs no
 * new backend surface and no second invalidation path.
 *
 * `fetchWithoutLocale` because a key is not translated: the same `offer` page
 * exists under every locale the owner saved it in, and a locale-scoped fetch
 * would hold one cache entry per language for an answer that does not vary.
 *
 * An empty array is both "this shop has published nothing" and "the read
 * failed" on purpose: every consumer degrades the same way (a link is hidden,
 * never pointed at a placeholder), and the failure is reported to the server
 * log by `siteWideRead` rather than thrown into a checkout render.
 */
export async function listPublishedPageKeys(): Promise<string[]> {
  return siteWideRead("listPublishedPageKeys", async () => {
    const { pages } = await fetchWithoutLocale<{
      pages: Array<{ key: string }>
    }>("/store/tenant/pages/sitemap", {
      next: { tags: [PAGES_TAG] },
      cache: "force-cache",
    })

    return Array.from(new Set((pages ?? []).map((page) => page.key)))
  }, [])
}

/**
 * Page key → its latest `updated_at` across locales, from the same cached sitemap read as
 * `listPublishedPageKeys` (no second request): the document version a checkout consent is
 * stamped with (`@lib/util/checkout-consent`). Empty on a failed read, like the keys.
 */
export async function listPublishedPageVersions(): Promise<Record<string, string>> {
  return siteWideRead("listPublishedPageVersions", async () => {
    const { pages } = await fetchWithoutLocale<{
      pages: Array<{ key: string; updated_at?: string | null }>
    }>("/store/tenant/pages/sitemap", {
      next: { tags: [PAGES_TAG] },
      cache: "force-cache",
    })

    const versions: Record<string, string> = {}
    for (const page of pages ?? []) {
      if (page.updated_at && (!versions[page.key] || page.updated_at > versions[page.key])) {
        versions[page.key] = page.updated_at
      }
    }
    return versions
  }, {})
}
