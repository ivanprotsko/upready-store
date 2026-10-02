import type { HttpTypes } from "@medusajs/types"

import { getDeliveryDays, isPickupShippingOption, type DeliveryDays } from "./fulfillment"

/**
 * The delivery term the cart sidebar may quote next to «Отправление № N» BEFORE the
 * buyer has chosen anything (batch 5): only what the code already knows.
 *
 *  - The method already on the cart (a buyer who came back from the checkout) is the
 *    truth: its own term, or nothing when it has none.
 *  - Otherwise the shop's one delivery option (pickup points aside), when it carries a
 *    term (`delivery_days_min/max`, `getDeliveryDays`).
 *  - Two or more delivery options to choose from: nothing — the sidebar does not guess.
 */
export const cartDeliveryDays = (
  cart: Pick<HttpTypes.StoreCart, "shipping_methods">,
  options: readonly HttpTypes.StoreCartShippingOptionWithServiceZone[] | null | undefined
): DeliveryDays | null => {
  const all = options ?? []
  const chosenId = cart.shipping_methods?.[0]?.shipping_option_id
  if (chosenId) {
    const chosen = all.find((option) => option.id === chosenId)
    return chosen ? getDeliveryDays(chosen) : null
  }

  const delivery = all.filter((option) => !isPickupShippingOption(option))
  return delivery.length === 1 ? getDeliveryDays(delivery[0]) : null
}

const dayFrom = (now: Date, days: number): Date => {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return date
}

/**
 * «6–13 октября» for `{min: 3, max: 10}` counted from `now`, in the locale's own day and
 * month words; one date when the term has one end or both ends fall on the same day;
 * `null` when there is no term. The same arithmetic the checkout's delivery card uses
 * (`checkout-shipping-section`), kept here so the sidebar and a later order page agree.
 */
export const formatDeliveryRange = (
  locale: string,
  now: Date,
  days: DeliveryDays | null | undefined
): string | null => {
  if (!days) return null
  const min = days.min ?? days.max
  const max = days.max ?? days.min
  if (min === undefined || max === undefined) return null

  const formatter = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" })
  const start = dayFrom(now, Math.min(min, max))
  const end = dayFrom(now, Math.max(min, max))

  if (start.getTime() === end.getTime()) return formatter.format(start)
  if (typeof formatter.formatRange === "function") {
    return formatter.formatRange(start, end)
  }
  return `${formatter.format(start)} – ${formatter.format(end)}`
}
