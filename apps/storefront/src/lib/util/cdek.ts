import type { HttpTypes } from "@medusajs/types"

/**
 * The CDEK side of the checkout, in one place (i02-apiship-cdek-shipping).
 *
 * Plain constants and pure functions, NOT in `lib/data/cdek.ts`: that file is
 * `"use server"` and may export async functions only — a constant there fails
 * the page at render with «Only async functions are allowed to be exported in a
 * "use server" file», which tsc and next lint both pass (measured on the stand
 * 2026-09-15, the same trap `lib/util/fulfillment.ts` documents).
 */

/** Provider id of `apps/backend/src/modules/cdek-fulfillment`. */
export const CDEK_PROVIDER_ID = "cdek_cdek"

export type CdekDeliveryKind = "courier" | "pickup" | "postamat"

export type CdekStorePoint = {
  code: string
  name: string
  type: string
  address: string
  city: string | null
  postal_code: string | null
  lat: number | null
  lng: number | null
  work_time: string | null
  phone: string | null
  note: string | null
  metro: string | null
  have_cashless: boolean | null
  is_dressing_room: boolean | null
  weight_max: number | null
}

type OptionWithProvider = { provider_id?: string | null; data?: unknown }

export const isCdekOption = (option?: OptionWithProvider | null): boolean =>
  option?.provider_id === CDEK_PROVIDER_ID

/**
 * Which CDEK delivery the option is. Read off the option's own `data`, which the
 * store API returns for a shipping option; a CDEK option whose `data` did not
 * come through is treated as a courier one, the kind that needs no point and so
 * cannot get stuck.
 */
export const cdekKindOf = (option?: OptionWithProvider | null): CdekDeliveryKind => {
  const kind = (option?.data as { kind?: unknown } | undefined)?.kind
  return kind === "pickup" || kind === "postamat" ? kind : "courier"
}

/** True when choosing this option must open the point sheet first. */
export const cdekNeedsPoint = (option?: OptionWithProvider | null): boolean =>
  isCdekOption(option) && cdekKindOf(option) !== "courier"

/**
 * The point already chosen for this cart, read off the cart's shipping method.
 * `shipping_methods[].data` is what the provider's `validateFulfillmentData`
 * returned, so the code and the name are both there.
 */
export const chosenCdekPoint = (
  cart?: HttpTypes.StoreCart | null
): { code: string; name: string | null } | null => {
  const method = (cart?.shipping_methods ?? []).find(
    (sm) => (sm.data as { provider?: unknown } | null)?.provider === "cdek"
  )
  const data = method?.data as { cdek_point_code?: unknown; cdek_point_name?: unknown } | null
  const code = typeof data?.cdek_point_code === "string" ? data.cdek_point_code : ""
  if (!code) return null
  return {
    code,
    name: typeof data?.cdek_point_name === "string" ? data.cdek_point_name : null,
  }
}

/** The delivery term the provider recorded, ready to print next to the price. */
export const cdekTermOf = (cart?: HttpTypes.StoreCart | null): string | null => {
  const method = (cart?.shipping_methods ?? []).find(
    (sm) => (sm.data as { provider?: unknown } | null)?.provider === "cdek"
  )
  const label = (method?.data as { term_label?: unknown } | null)?.term_label
  return typeof label === "string" && label ? label : null
}

/**
 * The city a point search should start from: the address the buyer already
 * typed. Returns an empty string when the address sheet has not been filled,
 * and the sheet then asks for a city itself rather than listing nothing.
 */
export const cityForPointSearch = (cart?: HttpTypes.StoreCart | null): string =>
  (cart?.shipping_address?.city ?? "").trim()
