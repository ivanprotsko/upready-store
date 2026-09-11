import { FetchError } from "@medusajs/js-sdk"
import {
  QueryKey,
  UseMutationOptions,
  UseQueryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query"

import { sdk } from "../../lib/client"
import { queryKeysFactory } from "../../lib/query-key-factory"
import { queryClient } from "../../lib/query-client"
import type { TenantHomeDocument } from "../../routes/home-settings/composition"

// tenant-panel: own hook file, no Admin counterpart — the Admin has no
// home-page document. `GET`/`PUT /tenants/home` per
// docs/tenant-panel/api-contract.md, "Piece 8". The response is the whole
// document or null (nothing saved yet), never a list, so there is no
// count/offset/limit here and no list query key.

export type TenantHomeResponse = { home: TenantHomeDocument | null }

const HOME_QUERY_KEY = "tenant-home" as const
export const tenantHomeQueryKeys = queryKeysFactory(HOME_QUERY_KEY)

export const useTenantHome = (
  options?: Omit<
    UseQueryOptions<TenantHomeResponse, FetchError, TenantHomeResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () => sdk.client.fetch<TenantHomeResponse>("/tenants/home"),
    queryKey: tenantHomeQueryKeys.details(),
    ...options,
  })

  return { ...data, ...rest }
}

/**
 * The body is the document without `updatedAt`: the server stamps it, the same
 * rule `/store/storefront-settings` follows. A rejected composition comes back
 * as a `FetchError` — 422 for a forbidden pair (with the reason in the body),
 * 400 for a field the vocabulary does not know or a category the tenant does
 * not own — and the screen renders its message rather than a generic failure.
 */
export const useUpdateTenantHome = (
  options?: UseMutationOptions<
    TenantHomeResponse,
    FetchError,
    Omit<TenantHomeDocument, "updatedAt">
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<TenantHomeResponse>("/tenants/home", {
        method: "PUT",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: tenantHomeQueryKeys.details() })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
