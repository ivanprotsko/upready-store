import type { CdekStorePoint } from "@lib/util/cdek"
import type { PickupRow, PickupRowLine } from "@modules/checkout/components/pickup-point-picker"

/**
 * A CDEK point as the shared picker draws it (t-2026-10-12-03, decision D2): CDEK's own
 * name of the office leads, the street address with a pin, the metro and the hours under
 * it. The phone and CDEK's note on how to get in show only once the row is expanded.
 */
export const cdekRowOf = (point: CdekStorePoint): PickupRow => {
  const lines: PickupRowLine[] = [{ icon: "pin", text: point.address }]
  if (point.metro) lines.push({ text: point.metro })
  if (point.work_time) lines.push({ icon: "clock", text: point.work_time })

  const extras: PickupRowLine[] = []
  if (point.phone) extras.push({ text: point.phone })
  if (point.note) extras.push({ text: point.note })

  return {
    id: point.code,
    title: point.name,
    lines,
    extras,
    lat: point.lat,
    lng: point.lng,
    kind: point.type === "POSTAMAT" ? "postamat" : "pvz",
    searchText: [point.name, point.address, point.metro, point.note].filter(Boolean).join(" "),
  }
}
