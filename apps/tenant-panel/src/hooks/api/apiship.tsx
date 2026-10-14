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
import { ordersQueryKeys } from "./orders"
import { shippingMethodsQueryKeys } from "./shipping-methods"

// The shop's ApiShip connection (p01-settings-integrations-restructure, then
// t-2026-10-14-58). The panel's own hook, no Admin counterpart. The stored
// settings come from our own database and render the screen instantly; whether
// ApiShip ACCEPTS the token is its own query, so a slow ApiShip never holds
// the screen (rule 19h — while it is in flight the page says so, it does not
// invent a verdict).

export type MaskedSecret = { set: boolean; last4: string | null }

export type ApishipSettings = {
  id: string
  is_enabled: boolean
  token: MaskedSecret
}

/** `GET /tenants/apiship/key`: the token slot alone, what the integrations hub reads. */
export type ApishipKeyResponse = {
  provider: "apiship"
  label: string
  /** `null` until the owner saves a token. */
  settings: ApishipSettings | null
}

export type ApishipKind = "courier" | "pickup"
export type ApishipSenderMode = "courier" | "point"

export type ApishipFullSettings = ApishipSettings & {
  sender_name: string | null
  sender_company: string | null
  sender_phone: string | null
  sender_email: string | null
  sender_country_code: string
  sender_region: string | null
  sender_city: string | null
  sender_address: string | null
  sender_index: string | null
  sender_mode: ApishipSenderMode
  sender_point_id: number | null
  default_weight_g: number
  default_length_cm: number
  default_width_cm: number
  default_height_cm: number
  webhook_registered: boolean
}

export type ApishipCarrier = {
  provider_key: string
  label: string
  /**
   * The kinds the OWNER CHOSE (`data.offered`, contract update of 14.10). Kept
   * by a PUT without `carriers` and by DELETE; not the same as what the
   * checkout shows while ApiShip cannot quote (no token, off, no sender).
   */
  kinds: ApishipKind[]
  tariff_id: number | null
  connection_id: string | null
  /** `enabled`: the method is at the checkout right now. */
  methods: Array<{ id: string; name: string; provider_key: string; kind: ApishipKind; enabled: boolean }>
}

/** `GET /tenants/apiship` (t-2026-10-14-58, contract section 1). */
export type ApishipResponse = {
  provider: "apiship"
  label: string
  settings: ApishipFullSettings | null
  /** The row exists but does not decrypt with this deployment's key (46df D1). */
  unreadable: { id: string; is_enabled: boolean } | null
  /** The fields a shipment still needs; empty when «Собрать» can create one. */
  missing: string[]
  /** Carries the webhook's own token: on screen only through `SecretValue`. */
  webhook_url: string | null
  test_contour: boolean
  carriers: ApishipCarrier[]
  pricing: { markup_amount: number; markup_percent: number; free_above_total: number | null }
  /** The direct methods of the same carriers a buyer sees next to ApiShip's. */
  duplicates: Array<{ id: string; name: string; provider_id: string; provider_key: string }>
}

export type ApishipSaveResponse = ApishipResponse & {
  verified: { connections: number; carriers_connected: string[]; carriers_skipped: string[] } | null
  webhook: { registered: boolean; error: string | null }
}

export type PutApishipBody = Partial<
  Omit<ApishipFullSettings, "id" | "token" | "webhook_registered"> & {
    token: string
    carriers: Array<{
      provider_key: string
      kinds: ApishipKind[]
      tariff_id?: number | null
      connection_id?: string | null
    }>
    markup_amount: number
    markup_percent: number
    free_above_total: number | null
  }
>

type CheapestTariff = {
  tariff_id: number
  name: string
  cost: number
  days_min: number
  days_max: number
} | null

export type ApishipCalculator = {
  route: { from: string; to: string; weight_g: number }
  results: Array<{
    provider_key: string
    label: string
    connected: boolean
    door: { tariffs: number; cheapest: CheapestTariff }
    point: { tariffs: number; cheapest: CheapestTariff }
  }>
  error: string | null
}

export type ApishipProbeResponse = {
  token_set: boolean
  /** `null` when no token is stored — «не спрошено», not «не принят». */
  probe: {
    ok: boolean
    /** The HTTP status ApiShip answered with; `null` when it never answered. */
    status: number | null
    connections: number | null
    error: string | null
  } | null
  connections?: Array<{ id: string; provider_key: string; label: string; name: string | null; test: boolean }>
  providers_connected?: string[]
  calculator?: ApishipCalculator | null
}

export type ApishipTariffsResponse = {
  provider_key: string
  label: string
  tariffs: Array<{
    id: number
    name: string
    description: string | null
    weight_min_g: number | null
    weight_max_g: number | null
    pickup_type: number | null
    delivery_type: number | null
  }>
}

export type ApishipDocumentKind = "labels" | "waybills"

/** `POST /tenants/apiship/documents` (contract section 2). */
export type ApishipDocumentsResponse = {
  kind: ApishipDocumentKind
  files: Array<{
    provider_key: string | null
    label: string
    url: string
    /** Our own route that streams the file under the session. */
    download: string
    order_ids: string[]
    display_ids: string[]
  }>
  failed: Array<{
    order_id: string | null
    display_id: string | null
    fulfillment_id: string | null
    apiship_order_id: number
    message: string
  }>
  without_shipment: string[]
}

/** `POST /tenants/apiship/status-sync` (contract section 2). */
export type ApishipStatusSyncResponse = {
  checked: number
  updated: number
  failed: number
  results: Array<{
    fulfillment_id: string
    apiship_order_id: number | null
    status: string | null
    provider_number: string | null
    changed: boolean
    shipped: boolean
    delivered: boolean
    error: string | null
  }>
}

const APISHIP_QUERY_KEY = "tenant-apiship" as const
export const apishipQueryKeys = queryKeysFactory(APISHIP_QUERY_KEY)

export const useApishipKey = (
  options?: Omit<
    UseQueryOptions<ApishipKeyResponse, FetchError, ApishipKeyResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryKey: apishipQueryKeys.detail("key"),
    queryFn: () => sdk.client.fetch<ApishipKeyResponse>("/tenants/apiship/key"),
    ...options,
  })

  return { apiship: data, ...rest }
}

export const useApiship = (
  options?: Omit<
    UseQueryOptions<ApishipResponse, FetchError, ApishipResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryKey: apishipQueryKeys.details(),
    queryFn: () => sdk.client.fetch<ApishipResponse>("/tenants/apiship"),
    ...options,
  })

  return { apiship: data, ...rest }
}

/**
 * The verdict on the stored token. `calculator: true` also asks ApiShip for a
 * Moscow → Saint Petersburg quote, which takes seconds: only on the owner's
 * «Проверить тарифы», never on opening the screen.
 */
export const useApishipProbe = (
  { calculator = false }: { calculator?: boolean } = {},
  options?: Omit<
    UseQueryOptions<ApishipProbeResponse, FetchError, ApishipProbeResponse, QueryKey>,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryKey: apishipQueryKeys.detail(calculator ? "probe-calculator" : "probe"),
    queryFn: () =>
      sdk.client.fetch<ApishipProbeResponse>("/tenants/apiship/probe", {
        query: calculator ? { calculator: 1 } : undefined,
      }),
    // The probe costs a call to ApiShip, so it is not refetched on every focus
    // the way a database read can be.
    staleTime: 60_000,
    ...options,
  })

  return { result: data, ...rest }
}

export const useApishipTariffs = (providerKey: string, options?: { enabled?: boolean }) => {
  const { data, ...rest } = useQuery({
    queryKey: apishipQueryKeys.detail(`tariffs-${providerKey}`),
    queryFn: () =>
      sdk.client.fetch<ApishipTariffsResponse>("/tenants/apiship/tariffs", {
        query: { provider_key: providerKey },
      }),
    staleTime: 10 * 60_000,
    ...options,
  })

  return { tariffs: data?.tariffs, ...rest }
}

export const useSaveApiship = (
  options?: UseMutationOptions<ApishipSaveResponse, FetchError, PutApishipBody>
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.client.fetch<ApishipSaveResponse>("/tenants/apiship", { method: "PUT", body: payload }),
    onSuccess: (data, variables, context) => {
      // The whole key, probe included: a new token makes the old verdict a
      // claim about a credential that is gone.
      queryClient.invalidateQueries({ queryKey: apishipQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: shippingMethodsQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

export const useDeleteApiship = (options?: UseMutationOptions<ApishipResponse, FetchError, void>) => {
  return useMutation({
    mutationFn: () => sdk.client.fetch<ApishipResponse>("/tenants/apiship", { method: "DELETE" }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: apishipQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: shippingMethodsQueryKeys.all })
      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}

/**
 * Switches a direct СДЭК / Почта method off, the way the Почта screen does. The
 * contract names `PATCH`; the route `tenants/shipping-methods/[id]` takes `POST`.
 */
export const useSwitchOffApishipDuplicate = () =>
  useMutation({
    mutationFn: (id: string) =>
      sdk.client.fetch(`/tenants/shipping-methods/${id}`, { method: "POST", body: { enabled: false } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apishipQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: shippingMethodsQueryKeys.all })
    },
  })

export type ApishipDocumentsBody = {
  kind: ApishipDocumentKind
  order_ids: string[]
  fulfillment_ids?: string[]
}

export const useApishipDocuments = () =>
  useMutation<ApishipDocumentsResponse, FetchError, ApishipDocumentsBody>({
    mutationFn: (body) =>
      sdk.client.fetch<ApishipDocumentsResponse>("/tenants/apiship/documents", { method: "POST", body }),
  })

/**
 * Streams one document through `download` (our route, under the session) and
 * saves it through a blob link, the way the order export saves its CSV.
 * `accept: application/pdf` makes the SDK hand back the raw `Response`.
 */
export const downloadApishipFile = async (download: string, filename: string) => {
  const [path, search = ""] = download.split("?")
  const query = Object.fromEntries(new URLSearchParams(search))
  const response = (await sdk.client.fetch(path, {
    method: "GET",
    headers: { accept: "application/pdf" },
    query: { ...query, name: filename },
  })) as unknown as Response
  const blob = await response.blob()

  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export const useApishipStatusSync = () =>
  useMutation<ApishipStatusSyncResponse, FetchError, { order_ids: string[] }>({
    mutationFn: (body) =>
      sdk.client.fetch<ApishipStatusSyncResponse>("/tenants/apiship/status-sync", {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      // The statuses live on the orders' fulfillments: the card and the list read them again.
      queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all })
    },
  })
