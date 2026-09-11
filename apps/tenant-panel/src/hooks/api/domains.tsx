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

// tenant-panel wave 2, piece 9 (storefront by host): the panel's own hook, no
// Admin counterpart — the Admin has no notion of a per-shop storefront host.
// Reads `/tenants/domains` (docs/tenant-panel/api-contract.md, "Piece 9").

export type TenantDomain = {
  id: string
  host: string
}

export type TenantDomainsResponse = {
  /** Custom hosts the tenant added; each one can be removed again. */
  domains: TenantDomain[]
  /**
   * `<handle>.<platform domain>`, derived by the backend from the handle and
   * its base-domain list. These have no row and no delete route on purpose:
   * the storefront of a shop must always be reachable somewhere
   * (docs/multitenancy/storefront-by-host.md §2).
   */
  technical: string[]
}

const DOMAINS_QUERY_KEY = "domains" as const
export const domainsQueryKeys = queryKeysFactory(DOMAINS_QUERY_KEY)

export const useDomains = (
  options?: Omit<
    UseQueryOptions<
      TenantDomainsResponse,
      FetchError,
      TenantDomainsResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryKey: domainsQueryKeys.lists(),
    queryFn: () => sdk.client.fetch<TenantDomainsResponse>("/tenants/domains"),
    ...options,
  })

  return { ...data, ...rest }
}

export const useCreateDomain = (
  options?: UseMutationOptions<
    { domain: TenantDomain },
    FetchError,
    { host: string }
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<{ domain: TenantDomain }>("/tenants/domains", {
        method: "POST",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: domainsQueryKeys.lists() })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useDeleteDomain = (
  options?: UseMutationOptions<
    { id: string; object: string; deleted: boolean },
    FetchError,
    string
  >
) => {
  return useMutation({
    mutationFn: (id) =>
      sdk.client.fetch<{ id: string; object: string; deleted: boolean }>(
        `/tenants/domains/${id}`,
        { method: "DELETE" }
      ),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: domainsQueryKeys.lists() })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
