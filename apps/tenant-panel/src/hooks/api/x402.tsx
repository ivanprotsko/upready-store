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
import { paymentSettingsQueryKeys, type UnreadableSecret } from "./payment-settings"

// The shop's own x402 (USDC) receiving address (t-2026-10-03-33). Reads
// `/tenants/payment-settings/x402`; nothing in it is secret, so no value is masked.

export type X402Network = {
  /** CAIP-2 id, for example `eip155:84532`. */
  id: string
  label: string
  testnet: boolean
}

export type X402Settings = {
  id: string
  provider: "x402"
  is_enabled: boolean
  is_test: boolean
  pay_to: string
  networks: string[]
  facilitator_url: string
}

export type X402Response = {
  provider: "x402"
  label: string
  /**
   * Whether this instance takes cryptocurrency at all. `false` there: the panel
   * shows no x402 anywhere, and a save would answer 403.
   */
  available: boolean
  /** The networks the instance allows; Base mainnet appears only when the operator enabled it. */
  networks_offered: X402Network[]
  default_facilitator_url: string
  /** Where AI agents POST to buy: they get 402 with the payment requirements. */
  agent_purchase_url: string
  /** `null` until the owner saves the form once, and while the stored row is unreadable. */
  settings: X402Settings | null
  unreadable: UnreadableSecret | null
}

export type PutX402Body = {
  pay_to?: string
  networks?: string[]
  facilitator_url?: string
  is_enabled?: boolean
}

const X402_QUERY_KEY = "tenant-x402" as const
export const x402QueryKeys = queryKeysFactory(X402_QUERY_KEY)

export const useTenantX402 = (
  options?: Omit<UseQueryOptions<X402Response, FetchError, X402Response, QueryKey>, "queryFn" | "queryKey">
) => {
  const { data, ...rest } = useQuery({
    queryKey: x402QueryKeys.details(),
    queryFn: () => sdk.client.fetch<X402Response>("/tenants/payment-settings/x402"),
    ...options,
  })
  return { x402: data, ...rest }
}

export const useSaveTenantX402 = (options?: UseMutationOptions<X402Response, FetchError, PutX402Body>) =>
  useMutation({
    ...options,
    mutationFn: (payload) =>
      sdk.client.fetch<X402Response>("/tenants/payment-settings/x402", { method: "PUT", body: payload }),
    onSuccess: (data, variables, context) => {
      queryClient.setQueryData(x402QueryKeys.details(), data)
      // «What the buyer sees» on the same screen reads x402's switch too.
      queryClient.invalidateQueries({ queryKey: paymentSettingsQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
  })
