"use server"

/**
 * Read path for the tenant's journal (t10-blog) — the articles a shop owner
 * writes in the tenant panel and this storefront renders under
 * `/<locale>/journal` and `/<locale>/journal/<slug>`.
 *
 * The backend answers only the PUBLISHED articles of the tenant behind this
 * storefront's publishable key; a draft, an unwritten slug and a neighbouring
 * tenant's article are all the same 404, on purpose — a visitor must not be
 * able to probe a shop's drafts by guessing slugs.
 *
 * Locale-scoped the same way `tenant-pages.ts` is: the locale rides both the
 * `x-medusa-locale` header `sdk.client.fetch` attaches and an explicit
 * `?locale=`, so Next's fetch cache holds one entry per language behind the
 * shared tag. The backend answers the visitor's language when that row is
 * published and falls back (language part → `en` → any), which is what a shop
 * whose Russian text is live and whose English translation is still a draft
 * needs to be readable at all.
 *
 * One shared cache tag, `"tenant-articles"`, cleared by `POST /api/revalidate`
 * with `{ "type": "tenant.articles" }`.
 */

import { sdk } from "@lib/config"
import { getLocale } from "./locale-actions"
import { defaultLocale } from "@i18n/config"

const ARTICLES_TAG = "tenant-articles"

export type TenantArticleSummary = {
  slug: string
  locale: string
  title: string
  excerpt: string | null
  cover_url: string | null
  published: boolean
  published_at: string | null
  tags: string[]
}

export type TenantArticle = TenantArticleSummary & {
  id: string
  body: string
  seo_title: string | null
  seo_description: string | null
}

export type TenantArticlePage = {
  articles: TenantArticleSummary[]
  count: number
  limit: number
  offset: number
}

const EMPTY_PAGE: TenantArticlePage = { articles: [], count: 0, limit: 0, offset: 0 }

let warnedUnreachable = false

/**
 * Never throw into a render over a feed: a backend that is down must not take
 * the storefront with it. The failure still surfaces in the server log (rule 20
 * — tolerating is not hiding), once per server process.
 *
 * A single-store install whose key has no tenant behind it answers 404 here,
 * which is not a failure at all: it means this storefront has no journal, and
 * an empty page is the right answer.
 */
export async function listTenantArticles(
  params: { limit?: number; offset?: number } = {}
): Promise<TenantArticlePage> {
  const { limit = 12, offset = 0 } = params

  try {
    const locale = (await getLocale()) ?? defaultLocale
    const query = new URLSearchParams({
      locale,
      limit: String(limit),
      offset: String(offset),
    })
    const page = await sdk.client.fetch<TenantArticlePage>(
      `/store/tenant/articles?${query.toString()}`,
      { next: { tags: [ARTICLES_TAG] }, cache: "force-cache" }
    )
    return {
      articles: page?.articles ?? [],
      count: page?.count ?? 0,
      limit: page?.limit ?? limit,
      offset: page?.offset ?? offset,
    }
  } catch (error) {
    if (!warnedUnreachable) {
      warnedUnreachable = true
      console.error(
        "listTenantArticles: /store/tenant/articles did not answer; the journal renders empty",
        error
      )
    }
    return EMPTY_PAGE
  }
}

/**
 * Whether this shop has a journal worth linking to. The navigation shows the
 * Journal entry only when at least one article is published (t10-blog), so a
 * shop that has never written one is not given a link to an empty page.
 *
 * Asks for one article rather than the whole feed: the answer is a boolean and
 * the response body should be one card, not twelve.
 */
export async function hasPublishedArticles(): Promise<boolean> {
  const { count } = await listTenantArticles({ limit: 1 })
  return count > 0
}

/**
 * One article by slug, or `null` when it is not published for this
 * storefront's tenant. The caller renders a 404 for `null`; it must not tell a
 * visitor whether the slug exists as a draft.
 */
export async function getTenantArticle(slug: string): Promise<TenantArticle | null> {
  try {
    const locale = (await getLocale()) ?? defaultLocale
    const { article } = await sdk.client.fetch<{ article: TenantArticle }>(
      `/store/tenant/articles/${encodeURIComponent(slug)}?locale=${encodeURIComponent(locale)}`,
      { next: { tags: [ARTICLES_TAG] }, cache: "force-cache" }
    )
    return article ?? null
  } catch {
    return null
  }
}
