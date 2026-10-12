import { compactWorkTime, type PochtaStorePoint } from "@lib/util/pochta"
import type { PickupRow } from "@modules/checkout/components/pickup-point-picker"

/**
 * A Russian Post point as the shared picker draws it (t-2026-10-12-03, decision D2). The
 * address leads, the way the carrier's own map names its offices; the office name and the
 * postcode sit under it with a pin, the hours with a clock (Ivan's Image #2). How to find
 * the entrance shows only once the row is expanded.
 *
 * `postcodeLabel` is the catalog's «Индекс {index}», passed in so the mapping stays pure.
 */
export const pochtaRowOf = (
  point: PochtaStorePoint,
  postcodeLabel: (index: string) => string
): PickupRow => ({
  id: point.index,
  title: point.address || point.name,
  lines: [
    { icon: "pin", text: `${point.name} · ${postcodeLabel(point.index)}` },
    ...(point.work_time.length > 0
      ? [{ icon: "clock" as const, text: compactWorkTime(point.work_time) }]
      : []),
  ],
  extras: point.directions ? [{ text: point.directions }] : [],
  // The directory writes 0 for a point it has no coordinates for: no marker beats one off
  // the coast of Africa.
  lat: point.lat || null,
  lng: point.lng || null,
  kind: "post",
  searchText: [point.name, point.address, point.index, point.directions].filter(Boolean).join(" "),
})
