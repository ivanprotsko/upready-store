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

import { sdk } from "@lib/config"
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
