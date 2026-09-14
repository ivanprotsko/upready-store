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

export type TenantArticle = {
  id: string
  slug: string
  locale: string
  title: string
  excerpt: string | null
  cover_url: string | null
  body: string
  published: boolean
  published_at: string | null
  tags: string[]
  seo_title: string | null
  seo_description: string | null
}

export type TenantArticleListResponse = { articles: TenantArticle[]; count: number }
export type TenantArticleResponse = { article: TenantArticle }
export type TenantArticleLocalesResponse = { articles: TenantArticle[] }

export type CreateTenantArticleBody = {
  slug: string
  locale: string
  title: string
}

export type PutTenantArticleBody = {
  locale?: string
  title: string
  excerpt?: string | null
  cover_url?: string | null
  body: string
  published: boolean
  published_at?: string | null
  tags?: string[] | null
  seo_title?: string | null
  seo_description?: string | null
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
      queryClient.invalidateQueries({ queryKey: articlesQueryKeys.lists() })
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
      queryClient.invalidateQueries({ queryKey: articlesQueryKeys.lists() })
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
      queryClient.invalidateQueries({ queryKey: articlesQueryKeys.lists() })
      queryClient.invalidateQueries({ queryKey: articlesQueryKeys.detail(slug) })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
