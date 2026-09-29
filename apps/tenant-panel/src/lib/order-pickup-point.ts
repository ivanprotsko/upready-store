import type { HttpTypes } from "@medusajs/types"

export type OrderPochtaPointData = {
  provider?: string
  pochta_point_index?: string
  pochta_point_name?: string | null
  pochta_point_address?: string | null
  pochta_point_city?: string | null
  pochta_point_region?: string | null
  term_label?: string | null
  tariff_source?: string | null
}

/**
 * The Russian Post pickup point the buyer chose (46df-pochta), read off the
 * order's shipping method `data`, which the provider wrote from the carrier's
 * directory. `null` for any other delivery. When there is one, it is where the
 * parcel goes, and the order page shows it first (U-04, 46df UX audit).
 */
export const orderPochtaPoint = (
  order: Pick<HttpTypes.AdminOrder, "shipping_methods">
): OrderPochtaPointData | null =>
  (order.shipping_methods ?? [])
    .map((method) => method?.data as OrderPochtaPointData | null | undefined)
    .find((entry) => entry?.provider === "pochta" && entry.pochta_point_index) ?? null
