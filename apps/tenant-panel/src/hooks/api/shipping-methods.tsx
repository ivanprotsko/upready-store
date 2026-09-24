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

// t04-shipping-tariffs: the shop's own delivery methods. No Admin counterpart
// (the Admin edits shipping options inside a location's fulfillment set); the
// panel's own module in the shape every other hooks/api module here has.
// Backend: apps/backend/src/api/tenants/shipping-methods/**.

export type ShippingTariff =
  | { kind: "flat"; amount: number }
  | {
      kind: "per_kg"
      base_amount: number
      per_kg_amount: number
      min_weight_g?: number | null
    }
  | { kind: "free_above"; amount: number; free_above_total: number }

export type MethodZone = {
  country_code: string
  /** Region strings as the backend's ru-regions list spells them; empty = the whole country. */
  provinces: string[]
  /** Human name of the zone («Урал»), written by the backend on every save. */
  label?: string | null
}

export type TenantShippingMethod = {
  id: string
  name: string
  description: string | null
  delivery_hint: string | null
  enabled: boolean
  tariff: ShippingTariff
  /** `"provisioned-default"` while the price is the starting one the shop was created with and the owner has not confirmed it. */
  tariff_source: "provisioned-default" | null
  /** `null` = every country the shop ships to. */
  zone: MethodZone | null
  /** The zone's name as the buyer reads it; always filled by the backend. */
  zone_label: string
  /** Delivery service key (`cdek`, `post_ru`, `dhl`, `courier`, `pickup`), or null. */
  carrier: string | null
  sort_order: number
  price_type: "flat" | "calculated"
  provider_id: string
  service_zone_id: string
  own_zone: boolean
  currency_code: string
  created_at: string
}

export type ShippingSettings = {
  default_weight_g: number
  currency_code: string
}

export type ShippingMethodsResponse = {
  methods: TenantShippingMethod[]
  settings: ShippingSettings
}

export type ShippingMethodResponse = { method: TenantShippingMethod }

export type ShippingRegion = { code: string; name: string; province: string }

export type ShippingMethodBody = {
  name: string
  description?: string | null
  delivery_hint?: string | null
  enabled: boolean
  zone: MethodZone | null
  carrier?: string | null
  tariff: ShippingTariff
}

// b03-shipping-zones-weight: ready-made Russian zones and the carriers a
// method can name. Backend: apps/backend/src/api/tenants/shipping-methods/zone-presets.

export type ShippingCarrier = {
  key: string
  label: string
  method_name: string
  description: string
  delivery_hint: string | null
  /** One paragraph for the owner: what she does by hand for this carrier. */
  instruction: string
  tracking_hint: string | null
}

export type ZonePreset = {
  key: string
  name: string
  description: string
  regions: { code: string; name: string }[]
  provinces: string[]
}

export type ZonePresetsResponse = {
  currency_code: string
  carriers: ShippingCarrier[]
  presets: ZonePreset[]
  existing_names: string[]
}

export type ZonePresetsBody = {
  carrier: string
  name?: string | null
  description?: string | null
  delivery_hint?: string | null
  enabled: boolean
  zones: {
    key: string
    base_amount: number
    per_kg_amount: number
    min_weight_g?: number | null
  }[]
}

export type ZonePresetsResult = {
  created: { key: string; name: string; id: string }[]
  skipped: { key: string; name: string; reason: string }[]
  methods: TenantShippingMethod[]
}

const SHIPPING_METHODS_QUERY_KEY = "tenant-shipping-methods" as const
export const shippingMethodsQueryKeys = queryKeysFactory(
  SHIPPING_METHODS_QUERY_KEY
)

const invalidate = () =>
  queryClient.invalidateQueries({ queryKey: shippingMethodsQueryKeys.all })

export const useShippingMethods = (
  options?: Omit<
    UseQueryOptions<
      ShippingMethodsResponse,
      FetchError,
      ShippingMethodsResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<ShippingMethodsResponse>("/tenants/shipping-methods"),
    queryKey: shippingMethodsQueryKeys.lists(),
    ...options,
  })

  return { ...data, ...rest }
}

export const useShippingMethod = (
  id: string,
  options?: Omit<
    UseQueryOptions<
      ShippingMethodResponse,
      FetchError,
      ShippingMethodResponse,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<ShippingMethodResponse>(
        `/tenants/shipping-methods/${id}`
      ),
    queryKey: shippingMethodsQueryKeys.detail(id),
    ...options,
  })

  return { ...data, ...rest }
}

export const useShippingRegions = (countryCode: string | null) => {
  const country = (countryCode ?? "").toLowerCase()
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<{ country_code: string; regions: ShippingRegion[] }>(
        "/tenants/shipping-methods/regions",
        { query: { country_code: country } }
      ),
    queryKey: [SHIPPING_METHODS_QUERY_KEY, "regions", country],
    enabled: country.length === 2,
  })

  return { regions: data?.regions ?? [], ...rest }
}

export const useZonePresets = () => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.client.fetch<ZonePresetsResponse>(
        "/tenants/shipping-methods/zone-presets"
      ),
    queryKey: [SHIPPING_METHODS_QUERY_KEY, "zone-presets"],
  })

  return { ...data, ...rest }
}

export const useCreateZoneMethods = (
  options?: UseMutationOptions<ZonePresetsResult, FetchError, ZonePresetsBody>
) =>
  useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<ZonePresetsResult>(
        "/tenants/shipping-methods/zone-presets",
        { method: "POST", body: payload }
      ),
    onSuccess: (data, variables, context) => {
      invalidate()
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })

export const useCreateShippingMethod = (
  options?: UseMutationOptions<
    ShippingMethodResponse,
    FetchError,
    ShippingMethodBody
  >
) =>
  useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<ShippingMethodResponse>("/tenants/shipping-methods", {
        method: "POST",
        body: payload,
      }),
    onSuccess: (data, variables, context) => {
      invalidate()
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })

export const useUpdateShippingMethod = (
  id: string,
  options?: UseMutationOptions<
    ShippingMethodResponse,
    FetchError,
    Partial<ShippingMethodBody>
  >
) =>
  useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<ShippingMethodResponse>(
        `/tenants/shipping-methods/${id}`,
        { method: "POST", body: payload }
      ),
    onSuccess: (data, variables, context) => {
      invalidate()
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })

export const useDeleteShippingMethod = (
  options?: UseMutationOptions<
    { id: string; deleted: boolean },
    FetchError,
    string
  >
) =>
  useMutation({
    mutationFn: (id) =>
      sdk.client.fetch<{ id: string; deleted: boolean }>(
        `/tenants/shipping-methods/${id}`,
        { method: "DELETE" }
      ),
    onSuccess: (data, variables, context) => {
      invalidate()
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })

export const useReorderShippingMethods = (
  options?: UseMutationOptions<
    { methods: TenantShippingMethod[] },
    FetchError,
    string[]
  >
) =>
  useMutation({
    mutationFn: (ids) =>
      sdk.client.fetch<{ methods: TenantShippingMethod[] }>(
        "/tenants/shipping-methods/reorder",
        { method: "POST", body: { ids } }
      ),
    onSuccess: (data, variables, context) => {
      invalidate()
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })

export const useUpdateShippingSettings = (
  options?: UseMutationOptions<
    { settings: ShippingSettings },
    FetchError,
    { default_weight_g: number }
  >
) =>
  useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<{ settings: ShippingSettings }>(
        "/tenants/shipping-methods/settings",
        { method: "POST", body: payload }
      ),
    onSuccess: (data, variables, context) => {
      invalidate()
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
