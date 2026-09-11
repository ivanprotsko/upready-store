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

// tenant-panel wave 2, piece 7: content pages. No Admin counterpart — the
// native Admin has no per-store content sections — so this module is the
// panel's own, written in the shape every other hooks/api module here has
// (queryKeysFactory + sdk.client.fetch + invalidation on success).
// Contract: docs/tenant-panel/api-contract.md, "Piece 7: content pages".

export const TENANT_PAGE_KEYS = [
  "contacts",
  "legal",
  "about",
  "privacy",
  "offer",
] as const

export type TenantPageKey = (typeof TENANT_PAGE_KEYS)[number]

/**
 * `id: null` is a section the tenant has never saved. `GET /tenants/pages`
 * always answers all five, so the list screen renders the full set without
 * knowing the vocabulary itself, and the edit screen opens an empty form for
 * an unsaved key rather than a 404.
 */
export type TenantPage = {
  id: string | null
  key: TenantPageKey
  locale: string
  title: string
  body: string
  published: boolean
}

export type TenantPageListResponse = { pages: TenantPage[] }
export type TenantPageResponse = { page: TenantPage }

export type PutTenantPageBody = {
  title: string
  body: string
  published: boolean
  locale?: string
}

const PAGES_QUERY_KEY = "tenant-pages" as const
export const pagesQueryKeys = queryKeysFactory(PAGES_QUERY_KEY)

export const useTenantPages = (
  options?: Omit<
    UseQueryOptions<
      TenantPageListResponse,
      FetchError,
      TenantPageListResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () => sdk.client.fetch<TenantPageListResponse>("/tenants/pages"),
    queryKey: pagesQueryKeys.lists(),
    ...options,
  })

  return { ...data, ...rest }
}

export const useTenantPage = (
  key: string,
  options?: Omit<
    UseQueryOptions<TenantPageResponse, FetchError, TenantPageResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () => sdk.client.fetch<TenantPageResponse>(`/tenants/pages/${key}`),
    queryKey: pagesQueryKeys.detail(key),
    ...options,
  })

  return { ...data, ...rest }
}

export const useUpdateTenantPage = (
  key: string,
  options?: UseMutationOptions<TenantPageResponse, FetchError, PutTenantPageBody>
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<TenantPageResponse>(`/tenants/pages/${key}`, {
        method: "PUT",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: pagesQueryKeys.lists() })
      queryClient.invalidateQueries({ queryKey: pagesQueryKeys.detail(key) })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
