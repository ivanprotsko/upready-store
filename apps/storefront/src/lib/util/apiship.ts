import type { HttpTypes } from "@medusajs/types"

/**
 * The ApiShip side of the checkout and the order page, in one place
 * (t-2026-10-14-58, part B). Plain constants and pure functions, not in
 * `lib/data/apiship.ts`, for the reason `lib/util/cdek.ts` gives: a
 * `"use server"` file may export async functions only.
 *
 * ApiShip is one provider for several carriers. The carrier is a field of the
 * option's `data` (`provider_key`), so СДЭК and Почта России through ApiShip are
 * two options of the same provider (`apps/backend/src/modules/apiship-fulfillment`).
 */

/** Provider id of `apps/backend/src/modules/apiship-fulfillment`. */
export const APISHIP_PROVIDER_ID = "apiship_apiship"

export type ApishipDeliveryKind = "courier" | "pickup"

/** One pickup point, as `/store/apiship/points` answers it (`toStorePoint` on the backend). */
export type ApishipStorePoint = {
  /** ApiShip's own id: the one the cart takes as `data.apiship_point_id`. */
  id: number
  code: string | null
  name: string
  /** 1 pickup point, 2 parcel locker, 3 post office, 4 terminal. */
  type: number | null
  address: string
  city: string | null
  region: string | null
  postal_code: string | null
  lat: number | null
  lng: number | null
  work_time: string | null
  phone: string | null
  note: string | null
  have_cashless: boolean | null
  is_dressing_room: boolean | null
  weight_max: number | null
}

export type ApishipPointsResponse = {
  configured: boolean
  provider_key: string | null
  city: string | null
  total: number
  points: ApishipStorePoint[]
}

type OptionWithProvider = { provider_id?: string | null; data?: unknown }

export const isApishipOption = (option?: OptionWithProvider | null): boolean =>
  option?.provider_id === APISHIP_PROVIDER_ID

const optionData = (option?: OptionWithProvider | null) =>
  (option?.data as { provider_key?: unknown; kind?: unknown } | null | undefined) ?? null

/** The carrier the option ships with, ApiShip's key: `cdek`, `rupost`. */
export const apishipProviderKeyOf = (option?: OptionWithProvider | null): string | null => {
  const key = optionData(option)?.provider_key
  return typeof key === "string" && key ? key : null
}

/**
 * Courier or a point. An option whose `data.kind` did not come through counts as
 * a pickup one: the provider refuses a pickup method without a point, so asking
 * for a point is the side that cannot leave the buyer with a failed order.
 */
export const apishipKindOf = (option?: OptionWithProvider | null): ApishipDeliveryKind =>
  optionData(option)?.kind === "courier" ? "courier" : "pickup"

/** True when choosing this option must open the point sheet first. */
export const apishipNeedsPoint = (option?: OptionWithProvider | null): boolean =>
  isApishipOption(option) && apishipKindOf(option) === "pickup"

/**
 * What the provider wrote on the cart's (or the order's) shipping method in
 * `validateFulfillmentData`: the point as the carrier names it, the tariff and
 * the term. `null` when the method is not an ApiShip one.
 */
export type ApishipMethodSummary = {
  pointId: number | null
  pointName: string | null
  pointAddress: string | null
  termLabel: string | null
  tariffName: string | null
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null

export const apishipMethodOf = (
  holder?: { shipping_methods?: Array<{ data?: unknown } | null> | null } | null
): ApishipMethodSummary | null => {
  const method = (holder?.shipping_methods ?? []).find(
    (sm) => (sm?.data as { provider?: unknown } | null)?.provider === "apiship"
  )
  if (!method) return null
  const data = method.data as Record<string, unknown>
  const pointId = typeof data.apiship_point_id === "number" ? data.apiship_point_id : null
  return {
    pointId,
    pointName: text(data.apiship_point_name),
    pointAddress: text(data.apiship_point_address),
    termLabel: text(data.term_label),
    tariffName: text(data.tariff_name),
  }
}

/** The point line of a row or a summary: the name the carrier gives, then its address. */
export const apishipPointLine = (summary: ApishipMethodSummary | null): string | null =>
  summary ? [summary.pointName, summary.pointAddress].filter(Boolean).join(", ") || null : null

/**
 * The status keys the buyer's order page names, the same set as
 * `APISHIP_STATUS_LABELS` in `apps/backend/src/apiship/statuses.ts`. `pending` is
 * worded as `uploading` there too. `notApplicable` and `unknown` say nothing to a
 * buyer and are left out, so the page shows no status line for them.
 */
export const APISHIP_STATUS_KEYS = [
  "uploading",
  "uploaded",
  "uploadingError",
  "onPointIn",
  "onWay",
  "onPointOut",
  "readyForRecipient",
  "delivering",
  "delivered",
  "partialReturn",
  "returnReady",
  "returning",
  "returned",
  "returnedFromDelivery",
  "deliveryCanceled",
  "problem",
  "lost",
] as const

export type ApishipStatusKey = (typeof APISHIP_STATUS_KEYS)[number]

/**
 * The catalog key (`ApishipStatus.<key>`) for the status the backend recorded
 * on the fulfillment (`data.apiship_status`), or `null` when there is nothing
 * worth a line: no ApiShip fulfillment, no status yet, or a key the map does
 * not name. The last fulfillment that has a status wins, the newest shipment.
 */
export const apishipStatusKeyOf = (
  fulfillments: Array<{ data?: unknown } | null> | null | undefined
): ApishipStatusKey | null => {
  const keys = (fulfillments ?? [])
    .map((fulfillment) => (fulfillment?.data as { apiship_status?: unknown } | null)?.apiship_status)
    .filter((key): key is string => typeof key === "string" && key.length > 0)
  const raw = keys.at(-1)
  if (!raw) return null
  const key = raw === "pending" ? "uploading" : raw
  return (APISHIP_STATUS_KEYS as readonly string[]).includes(key) ? (key as ApishipStatusKey) : null
}

/** The city a point search starts from: the one the buyer's address names. */
export const cityForApishipSearch = (cart?: HttpTypes.StoreCart | null): string =>
  (cart?.shipping_address?.city ?? "").trim()

const NONE: ApishipPointsResponse = {
  configured: false,
  provider_key: null,
  city: null,
  total: 0,
  points: [],
}

/**
 * The browser-side read of the picker. It calls this storefront's own route
 * handler, never the Store API directly (the publishable key belongs to the
 * request's host), and swallows a failure into an empty answer so the sheet
 * shows its own copy instead of a stack trace.
 */
export const fetchApishipPoints = async (
  query: { providerKey: string; city: string },
  signal?: AbortSignal
): Promise<ApishipPointsResponse> => {
  const search = new URLSearchParams({ provider_key: query.providerKey, city: query.city })
  try {
    const response = await fetch(`/api/apiship/points?${search.toString()}`, { signal })
    if (!response.ok) return NONE
    return (await response.json()) as ApishipPointsResponse
  } catch {
    return NONE
  }
}
