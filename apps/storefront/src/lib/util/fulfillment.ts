import type { HttpTypes } from "@medusajs/types"
import type { PickupPoint } from "@lib/theme/composition"

export const isPickupShippingOption = (
  option?: HttpTypes.StoreCartShippingOptionWithServiceZone | null
) => {
  return option?.service_zone?.fulfillment_set?.type === "pickup"
}

/**
 * A pickup-typed shipping option → the one pickup point it represents
 * (`composition.ts`'s `PickupPoint` contract). `@medusajs/types` 2.19.0's
 * `StoreCartShippingOptionWithServiceZone` only declares `location.{id,
 * address}` — `name` and `metadata` (opening hours) are real fields the API
 * returns once `fields` asks for them (`lib/data/fulfillment.ts`, probe 2 in
 * `.ai/probes.md`) but the store type omits, the same gap `checkout-totals`
 * already works around for `cart.discount_subtotal`.
 */
type PickupLocation = {
  name?: string
  metadata?: Record<string, unknown> | null
  address: {
    address_1: string | null
    address_2: string | null
    city: string | null
  }
}

export const toPickupPoint = (
  option: HttpTypes.StoreCartShippingOptionWithServiceZone
): PickupPoint => {
  const location = option.service_zone?.fulfillment_set?.location as
    | PickupLocation
    | undefined
  const address = location?.address
  const openingHours = location?.metadata?.opening_hours

  return {
    id: option.id,
    name: location?.name || option.name,
    addressLines: [address?.address_1, address?.address_2].filter(
      (line): line is string => !!line
    ),
    city: address?.city ?? "",
    openingHours: typeof openingHours === "string" ? openingHours : null,
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
