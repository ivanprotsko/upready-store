import { FetchError } from "@medusajs/js-sdk"
import {
  QueryKey,
  UseMutationOptions,
  UseQueryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query"

import { sdk } from "../../lib/client"
import { queryClient } from "../../lib/query-client"
import { queryKeysFactory } from "../../lib/query-key-factory"

// t10-blog: the shop's journal. No Admin counterpart — the native Admin has no
// per-store articles — so this module is the panel's own, written in the shape
// every other hooks/api module here has (queryKeysFactory + sdk.client.fetch +
// invalidation on success), the same way `pages.tsx` was.
//
// ONE ROW PER LOCALE: `slug` is the article, `(slug, locale)` its text in one
// language. The list screen groups the rows it gets back by slug; the edit
// screen edits one language at a time and switches between them.

/** b18-blog-full: three states, the same three the backend stores. */
export type ArticleStatus = "draft" | "published" | "scheduled"

export type TenantArticle = {
  id: string
  slug: string
  locale: string
  title: string
  excerpt: string | null
  cover_url: string | null
  body: string
  status: ArticleStatus
  /**
   * Whether a visitor sees it RIGHT NOW — computed by the backend, not stored.
   * A scheduled article flips it by itself when its date passes, so the panel
   * can say «опубликована по расписанию» without doing the arithmetic twice
   * (the storefront and the panel would drift the day one of them changed).
   */
  published: boolean
  published_at: string | null
  category: string | null
  author: string | null
  tags: string[]
  reading_minutes: number
  seo_title: string | null
  seo_description: string | null
}

export type TenantArticleListResponse = { articles: TenantArticle[]; count: number }
export type TenantArticleResponse = { article: TenantArticle }
export type TenantArticleLocalesResponse = { articles: TenantArticle[] }

/**
 * b18-blog-full: the WHOLE article in one call. t10-blog's `POST` made an empty
 * row and left the text to a second request, which is why the journal's only
 * entry point was a form asking for a URL; now «Новая статья» is one screen and
 * one save. Every field past the first three is optional, so the old two-step
 * call still works.
 */
export type CreateTenantArticleBody = {
  slug: string
  locale: string
  title: string
  body?: string
  excerpt?: string | null
  cover_url?: string | null
  status?: ArticleStatus
  published_at?: string | null
  category?: string | null
  author?: string | null
  tags?: string[] | null
  seo_title?: string | null
  seo_description?: string | null
}

export type PutTenantArticleBody = {
  locale?: string
  title: string
  body: string
  /** The article's NEW address; every language row moves together. */
  slug?: string
  status?: ArticleStatus
  excerpt?: string | null
  cover_url?: string | null
  published_at?: string | null
  category?: string | null
  author?: string | null
  tags?: string[] | null
  seo_title?: string | null
  seo_description?: string | null
}

export type TenantArticleCategory = { category: string; count: number }
export type TenantArticleCategoriesResponse = {
  categories: TenantArticleCategory[]
  count: number
}

const ARTICLES_QUERY_KEY = "tenant-articles" as const
export const articlesQueryKeys = queryKeysFactory(ARTICLES_QUERY_KEY)

export const useTenantArticles = (
  options?: Omit<
    UseQueryOptions<
      TenantArticleListResponse,
      FetchError,
      TenantArticleListResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () => sdk.client.fetch<TenantArticleListResponse>("/tenants/articles"),
    queryKey: articlesQueryKeys.lists(),
    ...options,
  })

  return { ...data, ...rest }
}

/** Every language row of one article, which is what the edit screen opens on. */
export const useTenantArticle = (
  slug: string,
  options?: Omit<
    UseQueryOptions<
      TenantArticleLocalesResponse,
      FetchError,
      TenantArticleLocalesResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<TenantArticleLocalesResponse>(`/tenants/articles/${slug}`),
    queryKey: articlesQueryKeys.detail(slug),
    ...options,
  })

  return { ...data, ...rest }
}

export const useCreateTenantArticle = (
  options?: UseMutationOptions<TenantArticleResponse, FetchError, CreateTenantArticleBody>
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<TenantArticleResponse>("/tenants/articles", {
        method: "POST",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      // b18-blog-full: `all`, not `lists()` — the rubric vocabulary
      // (`[…, "categories"]`) is a sibling of the list and a save can add to it.
      queryClient.invalidateQueries({ queryKey: articlesQueryKeys.all })
      queryClient.invalidateQueries({
        queryKey: articlesQueryKeys.detail(variables.slug),
      })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useUpdateTenantArticle = (
  slug: string,
  options?: UseMutationOptions<TenantArticleResponse, FetchError, PutTenantArticleBody>
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<TenantArticleResponse>(`/tenants/articles/${slug}`, {
        method: "PUT",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      // b18-blog-full: `all`, not `lists()` — the rubric vocabulary
      // (`[…, "categories"]`) is a sibling of the list and a save can add to it.
      queryClient.invalidateQueries({ queryKey: articlesQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: articlesQueryKeys.detail(slug) })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

/**
 * Deletes the whole article, or one of its languages when `locale` is given —
 * withdrawing a bad translation must not take the original down with it.
 */
export const useDeleteTenantArticle = (
  slug: string,
  options?: UseMutationOptions<
    { id: string; object: string; deleted: boolean; locales: number },
    FetchError,
    { locale?: string } | void
  >
) => {
  return useMutation({
    mutationFn: (variables) => {
      const locale = variables && "locale" in variables ? variables.locale : undefined
      const query = locale ? `?locale=${encodeURIComponent(locale)}` : ""
      return sdk.client.fetch<{
        id: string
        object: string
        deleted: boolean
        locales: number
      }>(`/tenants/articles/${slug}${query}`, { method: "DELETE" })
    },
    onSuccess: (data, variables, context) => {
      // b18-blog-full: `all`, not `lists()` — the rubric vocabulary
      // (`[…, "categories"]`) is a sibling of the list and a save can add to it.
      queryClient.invalidateQueries({ queryKey: articlesQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: articlesQueryKeys.detail(slug) })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

/**
 * The rubrics this shop already uses, newest vocabulary first by count. Offered
 * as suggestions next to a free text field rather than as a closed list: the
 * backend discovers them from the articles themselves (b18-blog-full), so an
 * owner never manages a list before writing a first article, and an empty
 * answer is normal.
 */
export const useTenantArticleCategories = (
  options?: Omit<
    UseQueryOptions<
      TenantArticleCategoriesResponse,
      FetchError,
      TenantArticleCategoriesResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<TenantArticleCategoriesResponse>("/tenants/article-categories"),
    queryKey: [...articlesQueryKeys.all, "categories"],
    ...options,
  })

  return { ...data, ...rest }
}
