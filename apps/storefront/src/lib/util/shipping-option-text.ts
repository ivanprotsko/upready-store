import type { HttpTypes } from "@medusajs/types"

import { pickLocaleCopy } from "./locale-copy"

/** The buyer-facing texts an owner writes into a delivery method's `data`. */
export type ShippingOptionTextKey = "description" | "delivery_hint"

/**
 * A text the owner wrote into the method's `data`, in the page's language when the
 * method carries one for it, or null.
 *
 * Medusa's translations cover the option's `name` and leave `data` alone, so on
 * cherkashino.com/ru «DHL Express — международная доставка» stood over the English
 * description the shop's base language carries (t-2026-10-04-19, pass 3). A method
 * may now keep its other languages beside the base text, in the `i18n` shape the
 * home banners and the course page use (`pickLocaleCopy`):
 * `data.i18n.ru.description`. A locale with no entry, or an entry without this key,
 * reads the base text.
 */
export function shippingOptionText(
  option: Pick<HttpTypes.StoreCartShippingOption, "data">,
  key: ShippingOptionTextKey,
  locale: string | null | undefined
): string | null {
  const data = option.data as Record<string, unknown> | null | undefined
  const localized = pickLocaleCopy(data?.i18n, locale)?.[key]

  return text(localized) ?? text(data?.[key])
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null
