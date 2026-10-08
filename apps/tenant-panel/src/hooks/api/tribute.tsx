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
import { paymentSettingsQueryKeys, type MaskedSecret } from "./payment-settings"

// The shop's Tribute Shop API key (t-cherk-22). Reads `/tenants/tribute`; the
// key arrives masked as `{ set, last4 }` and its value never reaches the browser.

export type TributeSettings = {
  id: string
  provider: "tribute"
  is_enabled: boolean
  shop_id: string | null
  api_key: MaskedSecret
}

export type TributeResponse = {
  provider: "tribute"
  label: string
  /**
   * Whether this instance offers Tribute at all (`TRIBUTE_AVAILABLE` on the
   * backend). `false` on RU: the panel then shows no Tribute card, and a save
   * would answer 403.
   */
  available: boolean
  /** `null` until the owner saves a key once. */
  settings: TributeSettings | null
  /** What to paste into the webhook field of the Tribute dashboard. */
  callback_url: string
}

export type PutTributeBody = {
  /** Left out or empty: the stored key stays. */
  api_key?: string
  is_enabled?: boolean
}

export type DeleteTributeResponse = TributeResponse & { id: string | null; deleted: boolean }

const TRIBUTE_QUERY_KEY = "tenant-tribute" as const
export const tributeQueryKeys = queryKeysFactory(TRIBUTE_QUERY_KEY)

export const useTenantTribute = (
  options?: Omit<UseQueryOptions<TributeResponse, FetchError, TributeResponse, QueryKey>, "queryFn" | "queryKey">
) => {
  const { data, ...rest } = useQuery({
    queryKey: tributeQueryKeys.details(),
    queryFn: () => sdk.client.fetch<TributeResponse>("/tenants/tribute"),
    ...options,
  })
  return { tribute: data, ...rest }
}

export const useSaveTenantTribute = (options?: UseMutationOptions<TributeResponse, FetchError, PutTributeBody>) =>
  useMutation({
    ...options,
    mutationFn: (payload) => sdk.client.fetch<TributeResponse>("/tenants/tribute", { method: "PUT", body: payload }),
    onSuccess: (data, variables, context) => {
      queryClient.setQueryData(tributeQueryKeys.details(), data)
      // «What the buyer sees» on the same screen is resolved with Tribute too.
      queryClient.invalidateQueries({ queryKey: paymentSettingsQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
  })

export const useDeleteTenantTribute = (options?: UseMutationOptions<DeleteTributeResponse, FetchError, void>) =>
  useMutation({
    ...options,
    mutationFn: () => sdk.client.fetch<DeleteTributeResponse>("/tenants/tribute", { method: "DELETE" }),
    onSuccess: (data, variables, context) => {
      queryClient.setQueryData(tributeQueryKeys.details(), data)
      queryClient.invalidateQueries({ queryKey: paymentSettingsQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
  })
