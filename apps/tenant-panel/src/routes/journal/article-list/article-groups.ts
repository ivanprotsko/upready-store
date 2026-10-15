import type { TenantArticle } from "../../../hooks/api/articles"
import { DEFAULT_ARTICLE_LOCALE, shownStatus } from "../article-locales"

// t10-blog: one ROW per article, not per row of the table `GET
// /tenants/articles` returns: that endpoint answers one row per language, and
// an owner thinks of «the article about peptides», with Russian and English as
// its two texts.
//
// t-2026-10-14-01 (panel redesign, G4, prototype states `journal`,
// `journal-empty`, `journal-no-results`): the search, the two filters and the
// page live in the URL (`q`, `status`, `category`, `offset`), the parameters
// `_DataTable` writes, and are applied here in the browser — the backend
// answers every article at once. Free of React, so
// `src/__tests__/pages-journal-g4.test.mjs` runs it as is.

export type ArticleGroup = {
  slug: string
  /** The row shown in the table: Russian, else the default language, else the first. */
  primary: TenantArticle
  locales: TenantArticle[]
}

/** Groups the flat locale rows into articles, newest first. */
export const groupArticles = (rows: TenantArticle[]): ArticleGroup[] => {
  const bySlug = new Map<string, TenantArticle[]>()
  for (const row of rows) {
    const group = bySlug.get(row.slug) ?? []
    group.push(row)
    bySlug.set(row.slug, group)
  }

  return [...bySlug.entries()]
    .map(([slug, locales]) => {
      const sorted = [...locales].sort((a, b) => a.locale.localeCompare(b.locale))
      const primary =
        sorted.find((row) => row.locale === "ru") ??
        sorted.find((row) => row.locale === DEFAULT_ARTICLE_LOCALE) ??
        sorted[0]
      return { slug, primary, locales: sorted }
    })
    .sort((a, b) => {
      const dateA = a.primary.published_at ? Date.parse(a.primary.published_at) : -Infinity
      const dateB = b.primary.published_at ? Date.parse(b.primary.published_at) : -Infinity
      if (dateA !== dateB) return dateB - dateA
      return a.slug.localeCompare(b.slug)
    })
}

/**
 * Search runs over what an owner can SEE of an article — its title, its
 * address, its excerpt and its rubric, in every language it has — rather than
 * over the body: a hit deep inside a 12 000-character text that the row cannot
 * show reads as a false positive.
 */
export const matchesQuery = (group: ArticleGroup, query: string): boolean => {
  const needle = query.trim().toLowerCase()
  if (!needle) return true

  return group.locales.some((row) =>
    [row.title, row.slug, row.excerpt ?? "", row.category ?? "", ...row.tags]
      .join(" ")
      .toLowerCase()
      .includes(needle)
  )
}

/**
 * The status filter works on the ARTICLE: a row matches if any language does.
 * Several statuses picked are «any of them»; none picked is every article.
 */
export const matchesStatus = (group: ArticleGroup, statuses: string[]): boolean =>
  statuses.length === 0 || group.locales.some((row) => statuses.includes(shownStatus(row)))

export const matchesCategory = (group: ArticleGroup, categories: string[]): boolean =>
  categories.length === 0 || group.locales.some((row) => categories.includes(row.category ?? ""))

/**
 * A select filter's value from the URL: `published`, or `draft,scheduled` when
 * several are picked (`useSelectedParams` joins them with a comma).
 */
export const filterValues = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)

export type ArticleListQuery = {
  q?: string
  status?: string
  category?: string
  offset?: number
  limit: number
}

export const articleListPage = (
  groups: ArticleGroup[],
  { q, status, category, offset = 0, limit }: ArticleListQuery
): { rows: ArticleGroup[]; count: number } => {
  const statuses = filterValues(status)
  const categories = filterValues(category)
  const matched = groups.filter(
    (group) =>
      matchesQuery(group, q ?? "") &&
      matchesStatus(group, statuses) &&
      matchesCategory(group, categories)
  )
  const start = Number.isFinite(offset) && offset > 0 ? offset : 0
  return { rows: matched.slice(start, start + limit), count: matched.length }
}
