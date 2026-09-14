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
 * Not locale-scoped: the backend serves the `en` row, and this calls
 * `fetchWithoutLocale` rather than the locale-aware `sdk.client.fetch` every
 * catalog loader uses — one document per key, one shared cache tag, the same
 * reason `storefront-settings.ts` and `app/llms.txt/route.ts` do it
 * (AGENTS.md, "Two pieces of locale plumbing"). A per-locale read needs a
 * per-locale cache tag first, and the panel edits one language today.
 *
 * One shared cache tag, `"tenant-pages"`, cleared for everyone at once by
 * `POST /api/revalidate` with `{ "type": "tenant.pages" }`.
 */

import { fetchWithoutLocale } from "@lib/config"

const PAGES_TAG = "tenant-pages"

export type TenantPageLink = { key: string; title: string }

export type TenantPage = {
  id: string | null
  key: string
  locale: string
  title: string
  body: string
  published: boolean
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
    const { pages } = await fetchWithoutLocale<{ pages: TenantPageLink[] }>(
      "/store/tenant/pages",
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
    const { page } = await fetchWithoutLocale<{ page: TenantPage }>(
      `/store/tenant/pages/${encodeURIComponent(key)}`,
      { next: { tags: [PAGES_TAG] }, cache: "force-cache" }
    )
    return page ?? null
  } catch {
    return null
  }
}
