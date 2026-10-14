import type { HttpTypes } from "@medusajs/types"

/**
 * Pure helpers of «Способ доставки», moved out of the section's `index.tsx` unchanged
 * so the file has room for the ApiShip branch without growing (t-2026-10-14-58).
 */

export function getLocalizedCountryName(
  isoCode: string,
  locale: string,
  fallback: string
) {
  try {
    return (
      new Intl.DisplayNames([locale], { type: "region" }).of(
        isoCode.toUpperCase()
      ) ?? fallback
    )
  } catch {
    return fallback
  }
}

/** `data.sort_order` of a tenant method; anything else sorts last, in API order. */
export const sortOrderOf = (option: HttpTypes.StoreCartShippingOption): number => {
  const value = (option.data as { sort_order?: unknown } | null)?.sort_order
  return typeof value === "number" ? value : Number.MAX_SAFE_INTEGER
}

/**
 * The name of the zone that priced this method («Урал», «Россия, вся страна»),
 * written into `data.zone.label` by the backend on every save
 * (`apps/backend/src/shipping-tariffs/ru-zone-presets.ts`). A method saved
 * before zones had names carries none, and the card simply shows no zone line.
 */
export const zoneLabel = (
  option: HttpTypes.StoreCartShippingOption
): string | null => {
  const zone = (option.data as { zone?: { label?: unknown } | null } | null)?.zone
  const label = zone?.label
  return typeof label === "string" && label.trim() ? label.trim() : null
}
