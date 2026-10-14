"use server"

import { sdk } from "@lib/config"
import type { HttpTypes } from "@medusajs/types"
import { cache } from "react"
import { getAuthHeaders, getCacheOptions } from "./cookies"

// A-14 (46df audit): the cart's own shipping options and price were
// `force-cache` — an owner's price change or a disabled method never reached
// a checkout already open on the page, only a `force-cache` entry expiring on
// its own schedule. `no-store` on both; `React.cache()` wraps each so a
// checkout page that reads the same cart's options from more than one
// component in the same render still costs one request, not several.
export const listCartShippingMethods = cache(async (cartId: string) => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = {
    ...(await getCacheOptions("fulfillment")),
  }

  return sdk.client
    .fetch<HttpTypes.StoreShippingOptionListResponse>(
      `/store/shipping-options`,
      {
        method: "GET",
        query: {
          cart_id: cartId,
          // `+metadata` (delivery_days_min/max) plus the fields
          // `isPickupShippingOption()` and `toPickupPoint()` read
          // (`lib/util/fulfillment.ts`) — the core route's own default field
          // set omits `service_zone` entirely (`checkout-account-map.md` §2,
          // confirmed live in `.ai/probes.md` probe 2), so without this the
          // pickup gate is always false and every pickup-only branch in this
          // checkout never fires. Each pickup point is its own shipping
          // option (`seedFulfillment()`'s own doc comment,
          // `apps/backend/src/migration-scripts/lib/fulfillment.ts`), so its
          // `location` here (singular — a fulfillment set links 1:1 to a
          // stock location) is that ONE point's own name/address/hours; the
          // checkout groups every option sharing `fulfillment_set.type ===
          // "pickup"` into a single visual card and reads this data to fill
          // the point sheet, no second fetch.
          // `+data` and `+provider_id`: a tenant's own method (t04-shipping-
          // tariffs) keeps its description, delivery hint and display order in
          // `data`, and the checkout asks the quote route instead of Medusa's
          // `/calculate` when `provider_id` is the tariff provider.
          fields:
            "+metadata,+data,+provider_id,+service_zone.fulfillment_set.type,+service_zone.fulfillment_set.location.*,+service_zone.fulfillment_set.location.address.*",
        },
        headers,
        next,
        cache: "no-store",
      }
    )
    .then(({ shipping_options }) => shipping_options)
    .catch(() => {
      return null
    })
})

export type StorePickupPoint = {
  id: string
  name: string
  address: {
    address_1: string
    city: string
    postal_code: string
    country_code: string
  }
  opening_hours: string
}

/**
 * The active profile's pickup points (`GET /store/pickup-points`, seeded per
 * F6 by `seedFulfillment()` — `apps/backend/src/migration-scripts/lib/fulfillment.ts`).
 * Empty on a stand with no `STORE_PROFILE` pickup-points seed, matching
 * `isPickupShippingOption()` never being true there either.
 */
export const listPickupPoints = async () => {
  const next = {
    ...(await getCacheOptions("pickup-points")),
  }

  return sdk.client
    .fetch<{ pickup_points: StorePickupPoint[] }>(`/store/pickup-points`, {
      method: "GET",
      next,
      cache: "force-cache",
    })
    .then(({ pickup_points }) => pickup_points)
    .catch(() => {
      return [] as StorePickupPoint[]
    })
}

// A-14 (46df audit): same reasoning as `listCartShippingMethods` above — this
// never carried `force-cache` explicitly, but named neither `cache` option
// either, which the framework's own default has changed across versions; an
// explicit `no-store` says so rather than leaning on whatever that default is
// today.
/**
 * The code the backend opens its answer with when CDEK's calculator refuses the
 * buyer's address (`CDEK_ADDRESS_REJECTED` in the cdek-fulfillment provider,
 * t-2026-10-09-56): the checkout then shows its own sentence about the postcode and
 * the city instead of the general «Недоступно».
 */
// Not exported: a "use server" module may export async functions only.
const CDEK_ADDRESS_REJECTED_CODE = "cdek_address_rejected"
/** ApiShip's calculator refusing the address (`APISHIP_ADDRESS_REJECTED`, t-2026-10-14-58). */
const APISHIP_ADDRESS_REJECTED_CODE = "apiship_address_rejected"

/** What a failed `/calculate` said, for the card: the backend's code, else `other`. */
export type ShippingPriceFailure = {
  error: "cdek_address_rejected" | "apiship_address_rejected" | "other"
}

export const calculatePriceForShippingOption = cache(async (
  optionId: string,
  cartId: string,
  data?: Record<string, unknown>
) => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = {
    ...(await getCacheOptions("fulfillment")),
  }

  const body = { cart_id: cartId, data }

  if (data) {
    body.data = data
  }

  return sdk.client
    .fetch<{ shipping_option: HttpTypes.StoreCartShippingOption }>(
      `/store/shipping-options/${optionId}/calculate`,
      {
        method: "POST",
        body,
        headers,
        next,
        cache: "no-store",
      }
    )
    .then(
      ({ shipping_option }): HttpTypes.StoreCartShippingOption | ShippingPriceFailure =>
        shipping_option
    )
    .catch((e: unknown): ShippingPriceFailure => {
      // t-2026-10-09-56 (Ivan's item 9, «почему-то не показывает стоимость сдэк»):
      // the card says «Недоступно: не удалось рассчитать стоимость», and the backend's
      // reason (the provider's own sentence) stays in this server's log, where it
      // can be read; before, it was dropped without a trace.
      console.error(
        `calculatePriceForShippingOption: option ${optionId} was not priced:`,
        e instanceof Error ? e.message : e
      )
      const message = e instanceof Error ? e.message : String(e)
      return {
        error: message.includes(CDEK_ADDRESS_REJECTED_CODE)
          ? "cdek_address_rejected"
          : message.includes(APISHIP_ADDRESS_REJECTED_CODE)
            ? "apiship_address_rejected"
            : "other",
      }
    })
})

export type ShippingQuote = {
  shipping_option_id: string
  name: string
  currency_code: string
  /** The zone the shop priced this parcel in («Урал»), in the owner's own words. */
  zone_label?: string | null
  kind: "flat" | "per_kg" | "free_above"
  amount: number
  weight_g: number
  item_total: number
  used_default_weight: boolean
  /** One line under the price, e.g. «2,4 кг × 180 ₽ + 150 ₽»; empty for a plain flat price. */
  explanation: string
}

/**
 * Price + explanation of one tenant tariff method for the cart, from
 * `POST /store/shipping-methods/quote`. The backend runs the same arithmetic
 * the fulfillment provider runs when the method is set on the cart, so the
 * number shown here is the number charged; nothing is computed in the browser.
 */
export const quoteShippingMethod = async (optionId: string, cartId: string) => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.client
    .fetch<{ quote: ShippingQuote }>(`/store/shipping-methods/quote`, {
      method: "POST",
      body: { cart_id: cartId, shipping_option_id: optionId },
      headers,
      cache: "no-store",
    })
    .then(({ quote }) => quote)
    .catch(() => null)
}

export type ShippingRegion = { code: string; name: string; province: string }

/**
 * Regions a shop can restrict a delivery zone to, per country
 * (`GET /store/shipping-methods/regions`). The manual address form offers
 * them in a select so the `province` it writes is the exact string a zone was
 * built from. Empty for a country without a list.
 */
export const listShippingRegions = async (countryCode: string) => {
  const next = {
    ...(await getCacheOptions("fulfillment")),
  }

  return sdk.client
    .fetch<{ country_code: string; regions: ShippingRegion[] }>(
      `/store/shipping-methods/regions`,
      {
        method: "GET",
        query: { country_code: countryCode.toLowerCase() },
        next,
        cache: "force-cache",
      }
    )
    .then(({ regions }) => regions)
    .catch(() => [] as ShippingRegion[])
}
