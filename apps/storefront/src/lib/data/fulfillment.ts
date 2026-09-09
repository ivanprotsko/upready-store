"use server"

import { sdk } from "@lib/config"
import type { HttpTypes } from "@medusajs/types"
import { getAuthHeaders, getCacheOptions } from "./cookies"

export const listCartShippingMethods = async (cartId: string) => {
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
          fields:
            "+metadata,+service_zone.fulfillment_set.type,+service_zone.fulfillment_set.location.*,+service_zone.fulfillment_set.location.address.*",
        },
        headers,
        next,
        cache: "force-cache",
      }
    )
    .then(({ shipping_options }) => shipping_options)
    .catch(() => {
      return null
    })
}

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

export const calculatePriceForShippingOption = async (
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
      }
    )
    .then(({ shipping_option }) => shipping_option)
    .catch((_e) => {
      return null
    })
}
