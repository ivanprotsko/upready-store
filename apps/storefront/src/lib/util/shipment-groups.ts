import type { HttpTypes } from "@medusajs/types"

/**
 * The cart split into shipments («Отправление № N», batch 5 of the cherkashino.com
 * design work, Ivan 03.10: «деление на посылки стоит сверстать … вместо "посылка" писать
 * Отправление № N»).
 *
 * The number is an ORDINAL inside one cart or one order (1, 2, …), never a global id —
 * Medusa's fulfillment ids and the carrier's tracking number exist only after the order.
 * It is known before the checkout, and it stays the same on the order page as long as
 * the same function runs on the order's items, so nothing is renumbered later.
 *
 * The key today is digital vs physical: a line that posts nothing (an online course)
 * goes to the one `digital` group, every other line to the one `physical` group. The
 * warehouse per line (`locationId`) is the next key, as soon as the store API exposes
 * the stock location of a line; it is typed here and not read anywhere yet, so adding it
 * splits the physical lines into one group per warehouse without another rewrite.
 */
export type ShipmentKind = "physical" | "digital"

export type ShipmentLine = {
  id: string
  /** Nothing to post: the line is delivered by e-mail or an account, not a parcel. */
  digital: boolean
  /** The stock location the line ships from, once the store API tells it. Unused today. */
  locationId?: string | null
}

export type ShipmentGroup<L extends ShipmentLine = ShipmentLine> = {
  /** Stable grouping key: `digital`, or `physical:<locationId|default>`. */
  key: string
  /** 1…N for physical groups in key order; `null` for the digital group. */
  no: number | null
  kind: ShipmentKind
  lines: L[]
}

export const DIGITAL_GROUP_KEY = "digital"

export const physicalGroupKey = (locationId?: string | null): string =>
  `physical:${locationId || "default"}`

/**
 * Groups the lines, in the order they are shown: physical groups first, numbered 1…N
 * by key, then the digital group with no number. Lines keep their own order inside a
 * group. An empty input gives no groups.
 */
export function shipmentGroups<L extends ShipmentLine>(
  lines: readonly L[]
): ShipmentGroup<L>[] {
  const byKey = new Map<string, ShipmentGroup<L>>()

  for (const line of lines) {
    const kind: ShipmentKind = line.digital ? "digital" : "physical"
    const key =
      kind === "digital" ? DIGITAL_GROUP_KEY : physicalGroupKey(line.locationId)
    let group = byKey.get(key)
    if (!group) {
      group = { key, no: null, kind, lines: [] }
      byKey.set(key, group)
    }
    group.lines.push(line)
  }

  const physical = Array.from(byKey.values())
    .filter((group) => group.kind === "physical")
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  physical.forEach((group, index) => {
    group.no = index + 1
  })

  const digital = byKey.get(DIGITAL_GROUP_KEY)
  return digital ? [...physical, digital] : physical
}

/**
 * Whether a cart line posts nothing. The same contract the checkout's digital-cart
 * check reads (`isDigitalDeliveryCart`, `lib/util/shipping-address.ts`): the product's
 * `metadata.digital === "true"` (o24-courses, the seed's own contract). The cart fetch
 * expands `+items.product.metadata` for exactly this read.
 */
export const isDigitalCartLine = (item: HttpTypes.StoreCartLineItem): boolean =>
  (item.product?.metadata as Record<string, unknown> | null | undefined)
    ?.digital === "true"

/** A cart line as `shipmentGroups` reads it, with the line itself kept alongside. */
export type CartShipmentLine = ShipmentLine & { item: HttpTypes.StoreCartLineItem }

export const cartShipmentLines = (
  items: readonly HttpTypes.StoreCartLineItem[] | null | undefined
): CartShipmentLine[] =>
  (items ?? []).map((item) => ({
    id: item.id,
    digital: isDigitalCartLine(item),
    item,
  }))
