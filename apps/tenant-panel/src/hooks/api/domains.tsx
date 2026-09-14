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
  /**
   * The shop's MAIN public address: the one search is pointed at, and the one
   * every other address of the shop redirects to
   * (specs/tenant-address/CANONICAL.md §1.1).
   */
  is_primary: boolean
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
  /** The shop's main address today, custom domain or platform subdomain. */
  primary_host: string
  /** Addresses the shop used to answer on; they redirect and stay reserved for it. */
  previous_hosts: string[]
  previous_handles: string[]
  /** `<tenant_id>.<base>` — never changes, never canonical, always redirects. */
  technical_id_host: string
  base_domain: string
}

export type ChangeHandleResponse = {
  handle: string
  primary_host: string
  previous_host: string
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

/**
 * The shop's address itself (`POST /tenants/handle`). The old address keeps
 * answering and redirects page for page, and its handle stays reserved for this
 * shop — the screen says so before the owner confirms
 * (specs/tenant-address/CANONICAL.md §1.2).
 */
export const useChangeHandle = (
  options?: UseMutationOptions<ChangeHandleResponse, FetchError, { handle: string }>
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<ChangeHandleResponse>("/tenants/handle", {
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

/**
 * Promote a custom domain to the shop's main address. The backend checks that it
 * actually answers as this shop first: a canonical URL pointing at a host that
 * does not serve the shop is the defect this whole task came from.
 */
export const useSetPrimaryDomain = (
  options?: UseMutationOptions<{ domain: TenantDomain }, FetchError, string>
) => {
  return useMutation({
    mutationFn: (id) =>
      sdk.client.fetch<{ domain: TenantDomain }>(
        `/tenants/domains/${id}/primary`,
        { method: "POST" }
      ),
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
