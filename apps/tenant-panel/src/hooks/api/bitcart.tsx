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
import { paymentSettingsQueryKeys, type MaskedSecret, type UnreadableSecret } from "./payment-settings"

// The shop's own Bitcart store (ask-20261005-070255-438f, stage 2). Reads
// `/tenants/payment-settings/bitcart`; the API token arrives masked as
// `{ set, last4 }` and its value never reaches the browser.

export type BitcartSettings = {
  id: string
  provider: "bitcart"
  is_enabled: boolean
  /** The Merchants API, e.g. `https://pay.example.com/api`. */
  server_url: string
  /** The admin app that serves the checkout page, e.g. `https://pay.example.com/admin`. */
  admin_url: string
  store_id: string
  api_key: MaskedSecret
}

export type BitcartResponse = {
  provider: "bitcart"
  label: string
  /**
   * Whether this instance takes cryptocurrency at all (`PAYMENTS_CRYPTO_AVAILABLE`
   * on the backend), the same switch as BTCPay's. `false` on RU: the panel
   * then shows no Bitcart anywhere, and a save would answer 403.
   */
  available: boolean
  /** `null` until the owner saves the form once, and while the stored row is unreadable. */
  settings: BitcartSettings | null
  unreadable: UnreadableSecret | null
  /** Where every invoice asks Bitcart to report; `null` when the backend has no public address configured. */
  notification_url: string | null
}

export type PutBitcartBody = {
  server_url?: string
  admin_url?: string
  store_id?: string
  /** Left out or empty: the stored value stays. */
  api_key?: string
  is_enabled?: boolean
}

const BITCART_QUERY_KEY = "tenant-bitcart" as const
export const bitcartQueryKeys = queryKeysFactory(BITCART_QUERY_KEY)

export const useTenantBitcart = (
  options?: Omit<UseQueryOptions<BitcartResponse, FetchError, BitcartResponse, QueryKey>, "queryFn" | "queryKey">
) => {
  const { data, ...rest } = useQuery({
    queryKey: bitcartQueryKeys.details(),
    queryFn: () => sdk.client.fetch<BitcartResponse>("/tenants/payment-settings/bitcart"),
    ...options,
  })
  return { bitcart: data, ...rest }
}

export const useSaveTenantBitcart = (options?: UseMutationOptions<BitcartResponse, FetchError, PutBitcartBody>) =>
  useMutation({
    ...options,
    mutationFn: (payload) =>
      sdk.client.fetch<BitcartResponse>("/tenants/payment-settings/bitcart", { method: "PUT", body: payload }),
    onSuccess: (data, variables, context) => {
      queryClient.setQueryData(bitcartQueryKeys.details(), data)
      // «What the buyer sees» on the same screen reads Bitcart's switch too.
      queryClient.invalidateQueries({ queryKey: paymentSettingsQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
  })
