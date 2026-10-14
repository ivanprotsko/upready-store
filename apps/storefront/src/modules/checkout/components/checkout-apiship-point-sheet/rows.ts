import type { ApishipStorePoint } from "@lib/util/apiship"
import type { PickupMapKind } from "@modules/checkout/components/checkout-pickup-map"
import type { PickupRow, PickupRowLine } from "@modules/checkout/components/pickup-point-picker"

/** ApiShip's point types: 2 is a parcel locker, 3 a post office, the rest hand parcels out over a counter. */
const kindOf = (type: number | null): PickupMapKind =>
  type === 2 ? "postamat" : type === 3 ? "post" : "pvz"

/**
 * An ApiShip point as the shared picker draws it (t-2026-10-14-58, part B), in the
 * layout of a direct CDEK point (`checkout-cdek-point-sheet/rows.ts`): the carrier's
 * own name of the point leads, the address with a pin and the hours with a clock
 * under it. The phone and the carrier's note on how to get in show only once the row
 * is expanded. The row id is ApiShip's numeric `id` as a string: the picker keys its
 * rows by string, and the cart takes the number back (`apiship_point_id`).
 */
export const apishipRowOf = (point: ApishipStorePoint): PickupRow => {
  const lines: PickupRowLine[] = [{ icon: "pin", text: point.address }]
  if (point.work_time) lines.push({ icon: "clock", text: point.work_time })

  const extras: PickupRowLine[] = []
  if (point.phone) extras.push({ text: point.phone })
  if (point.note) extras.push({ text: point.note })

  return {
    id: String(point.id),
    title: point.name || point.address,
    lines,
    extras,
    lat: point.lat,
    lng: point.lng,
    kind: kindOf(point.type),
    searchText: [point.name, point.address, point.postal_code, point.note]
      .filter(Boolean)
      .join(" "),
  }
}
