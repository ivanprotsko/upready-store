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

// The shop's own BTCPay Server store (ask-20261005-070255-438f). Reads
// `/tenants/payment-settings/btcpay`; the API key and the webhook secret arrive
// masked as `{ set, last4 }` and their values never reach the browser.

export type BtcpaySettings = {
  id: string
  provider: "btcpay"
  is_enabled: boolean
  server_url: string
  store_id: string
  api_key: MaskedSecret
  webhook_secret: MaskedSecret
}

export type BtcpayResponse = {
  provider: "btcpay"
  label: string
  /** `null` until the owner saves the form once, and while the stored row is unreadable. */
  settings: BtcpaySettings | null
  unreadable: UnreadableSecret | null
  /** What to paste into the webhook of the BTCPay store. */
  webhook_url: string
}

export type PutBtcpayBody = {
  server_url?: string
  store_id?: string
  /** Left out or empty: the stored value stays. */
  api_key?: string
  webhook_secret?: string
  is_enabled?: boolean
}

const BTCPAY_QUERY_KEY = "tenant-btcpay" as const
export const btcpayQueryKeys = queryKeysFactory(BTCPAY_QUERY_KEY)

export const useTenantBtcpay = (
  options?: Omit<UseQueryOptions<BtcpayResponse, FetchError, BtcpayResponse, QueryKey>, "queryFn" | "queryKey">
) => {
  const { data, ...rest } = useQuery({
    queryKey: btcpayQueryKeys.details(),
    queryFn: () => sdk.client.fetch<BtcpayResponse>("/tenants/payment-settings/btcpay"),
    ...options,
  })
  return { btcpay: data, ...rest }
}

export const useSaveTenantBtcpay = (options?: UseMutationOptions<BtcpayResponse, FetchError, PutBtcpayBody>) =>
  useMutation({
    ...options,
    mutationFn: (payload) =>
      sdk.client.fetch<BtcpayResponse>("/tenants/payment-settings/btcpay", { method: "PUT", body: payload }),
    onSuccess: (data, variables, context) => {
      queryClient.setQueryData(btcpayQueryKeys.details(), data)
      // «What the buyer sees» on the same screen reads BTCPay's switch too.
      queryClient.invalidateQueries({ queryKey: paymentSettingsQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
  })
