import type { HttpTypes } from "@medusajs/types"

import { PICKUP_METADATA_KEYS } from "@lib/theme/composition"

export const isPickupShippingOption = (
  option?: HttpTypes.StoreCartShippingOptionWithServiceZone | null
) => {
  return option?.service_zone?.fulfillment_set?.type === "pickup"
}

export type OrderPickupPoint = {
  id: string
  name: string
  /** Empty string when the checkout never filled the address key. */
  address: string
  hours: string | null
}

/**
 * Reads the pickup point a placed order carries on `order.metadata`, written
 * by the checkout under `composition.ts`'s `PICKUP_METADATA_KEYS` — the same
 * key set `cart.metadata` uses, confirmed to survive onto `order.metadata`
 * verbatim (`t-2026-09-09-02` C1 probe 1). Returns `null` for a courier order,
 * or for any order placed before a checkout pickup step exists (every order
 * today, until W14 seeds a real `"pickup"` fulfillment set).
 */
export const getOrderPickupPoint = (
  order?: { metadata?: Record<string, unknown> | null } | null
): OrderPickupPoint | null => {
  const metadata = order?.metadata
  if (!metadata) return null

  const id = metadata[PICKUP_METADATA_KEYS.id]
  const name = metadata[PICKUP_METADATA_KEYS.name]
  if (typeof id !== "string" || !id || typeof name !== "string" || !name) {
    return null
  }

  const address = metadata[PICKUP_METADATA_KEYS.address]
  const hours = metadata[PICKUP_METADATA_KEYS.hours]

  return {
    id,
    name,
    address: typeof address === "string" ? address : "",
    hours: typeof hours === "string" && hours ? hours : null,
  }
}

export type DeliveryDays = { min?: number; max?: number }

const parseDay = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === "") return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

export const getDeliveryDays = (
  option?: HttpTypes.StoreCartShippingOption | null
): DeliveryDays | null => {
  const meta = (option as { metadata?: Record<string, unknown> | null } | null)
    ?.metadata
  if (!meta) return null

  const min = parseDay(meta.delivery_days_min)
  const max = parseDay(meta.delivery_days_max)

  if (min === undefined && max === undefined) return null

  return { min, max }
}
