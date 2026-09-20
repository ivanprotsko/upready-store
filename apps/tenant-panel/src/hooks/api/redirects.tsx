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

// b10-panel-gaps: the shop's own redirect table. The routes shipped with
// t11-seo-redirects and stayed API-only for a day; this is the panel half.
// No Admin counterpart — a native Medusa install has no per-shop redirects.
//
// The list is not paginated on purpose: the backend answers every row of the
// tenant at once, a few dozen at most (the migration of Oksana's shop imported
// 47), so the screen sorts and filters them in the browser.

export type TenantRedirect = {
  id: string
  /** The old address, an exact pathname: leading slash, no host, no query. */
  from_path: string
  to_path: string
  /** 301 by default; 302/307/308 are offered for a move the owner may undo. */
  status_code: number
}

export type TenantRedirectsResponse = { redirects: TenantRedirect[] }
export type TenantRedirectResponse = { redirect: TenantRedirect }

export type CreateTenantRedirectBody = {
  from_path: string
  to_path: string
  status_code?: number
}

export type UpdateTenantRedirectBody = {
  from_path?: string
  to_path?: string
  status_code?: number
}

const REDIRECTS_QUERY_KEY = "tenant-redirects" as const
export const redirectsQueryKeys = queryKeysFactory(REDIRECTS_QUERY_KEY)

export const useTenantRedirects = (
  options?: Omit<
    UseQueryOptions<
      TenantRedirectsResponse,
      FetchError,
      TenantRedirectsResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () => sdk.client.fetch<TenantRedirectsResponse>("/tenants/redirects"),
    queryKey: redirectsQueryKeys.lists(),
    ...options,
  })

  return { ...data, ...rest }
}

export const useCreateTenantRedirect = (
  options?: UseMutationOptions<
    TenantRedirectResponse,
    FetchError,
    CreateTenantRedirectBody
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<TenantRedirectResponse>("/tenants/redirects", {
        method: "POST",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: redirectsQueryKeys.lists() })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useUpdateTenantRedirect = (
  id: string,
  options?: UseMutationOptions<
    TenantRedirectResponse,
    FetchError,
    UpdateTenantRedirectBody
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<TenantRedirectResponse>(`/tenants/redirects/${id}`, {
        method: "PUT",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: redirectsQueryKeys.lists() })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useDeleteTenantRedirect = (
  id: string,
  options?: UseMutationOptions<
    { id: string; object: string; deleted: boolean },
    FetchError,
    void
  >
) => {
  return useMutation({
    mutationFn: () =>
      sdk.client.fetch<{ id: string; object: string; deleted: boolean }>(
        `/tenants/redirects/${id}`,
        { method: "DELETE" }
      ),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: redirectsQueryKeys.lists() })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
