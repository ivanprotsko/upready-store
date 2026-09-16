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

// The shop's CDEK account (i02-apiship-cdek-shipping): the panel's own hook, no
// Admin counterpart. Reads `/tenants/delivery-settings`; the passwords arrive
// masked as `{ set, last4 }` and the values never reach the browser.

export type MaskedSecret = { set: boolean; last4: string | null }

export type CdekSenderMode = "door" | "warehouse"
export type CdekDeliveryKind = "courier" | "pickup" | "postamat"

export type DeliverySettings = {
  id: string
  provider: "cdek"
  is_test: boolean
  is_enabled: boolean
  account: string
  test_account: string
  password: MaskedSecret
  test_password: MaskedSecret
  sender_mode: CdekSenderMode
  sender_city_code: number | null
  sender_city_name: string | null
  sender_address: string | null
  sender_name: string | null
  sender_phone: string | null
  shipment_point: string | null
  /** True once CDEK has accepted the ORDER_STATUS subscription. */
  webhook_registered: boolean
}

export type CdekMethodSummary = {
  id: string
  name: string
  kind: CdekDeliveryKind
  enabled: boolean
}

export type DeliverySettingsResponse = {
  /** `null` until the owner saves an account. */
  settings: DeliverySettings | null
  webhook_url: string | null
  methods: CdekMethodSummary[]
  pricing: {
    markup_amount: number
    markup_percent: number
    free_above_total: number | null
  }
  /** Present on a save: how many tariffs CDEK answered with for the test route. */
  verified?: { tariffs: number } | null
  /** Present on a save: whether the status subscription went through. */
  webhook?: { registered: boolean; error: string | null }
}

export type PutDeliverySettingsBody = {
  provider: "cdek"
  is_test?: boolean
  is_enabled?: boolean
  account?: string
  test_account?: string
  /** Left out or empty: the stored value stays. */
  password?: string
  test_password?: string
  sender_mode?: CdekSenderMode
  sender_city_code?: number | null
  sender_city_name?: string
  sender_address?: string
  sender_name?: string
  sender_phone?: string
  shipment_point?: string
  kinds?: CdekDeliveryKind[]
  markup_amount?: number
  markup_percent?: number
  free_above_total?: number | null
}

const DELIVERY_SETTINGS_QUERY_KEY = "delivery-settings" as const
export const deliverySettingsQueryKeys = queryKeysFactory(DELIVERY_SETTINGS_QUERY_KEY)

export const useDeliverySettings = (
  options?: Omit<
    UseQueryOptions<DeliverySettingsResponse, FetchError, DeliverySettingsResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryKey: deliverySettingsQueryKeys.details(),
    queryFn: () => sdk.client.fetch<DeliverySettingsResponse>("/tenants/delivery-settings"),
    ...options,
  })

  return { ...data, ...rest }
}

export const useUpdateDeliverySettings = (
  options?: UseMutationOptions<DeliverySettingsResponse, FetchError, PutDeliverySettingsBody>
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<DeliverySettingsResponse>("/tenants/delivery-settings", {
        method: "PUT",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: deliverySettingsQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useDeleteDeliverySettings = (
  options?: UseMutationOptions<{ deleted: boolean }, FetchError, void>
) => {
  return useMutation({
    mutationFn: () =>
      sdk.client.fetch<{ deleted: boolean }>("/tenants/delivery-settings", {
        method: "DELETE",
      }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: deliverySettingsQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
