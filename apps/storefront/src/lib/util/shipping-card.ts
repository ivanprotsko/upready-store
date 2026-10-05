import { cdekKindOf, isCdekOption } from "@lib/util/cdek"
import { TARIFF_PROVIDER_ID } from "@lib/util/fulfillment"
import { isPochtaOption } from "@lib/util/pochta"

/**
 * U-12 (46df UX audit): a shipping card whose price the carrier did not give
 * (the calculation failed, the carrier's credentials do not read) used to show
 * «—» and stay choosable, and choosing it ran into the same failure one step
 * later. Such a card stays in the list, locked, with its reason in place of
 * the price, so the buyer sees why the method is missing rather than wondering
 * where it went. Russian Post is the exception: its price depends on the point
 * and its sheet quotes each point itself, so a missing list quote does not
 * mean the method cannot be used.
 */
export const isShippingCardUnpriced = ({
  priceAmount,
  isLoadingPrices,
  pricedPerPoint,
}: {
  priceAmount: number | null
  isLoadingPrices: boolean
  pricedPerPoint: boolean
}): boolean => priceAmount === null && !isLoadingPrices && !pricedPerPoint

/**
 * D10 (t-2026-10-04-19): the way a parcel reaches the buyer, the two cards the
 * checkout shows instead of one row per carrier option. Each card lists the
 * carriers and tariffs of its way, and the buyer picks one inside it.
 */
export type DeliveryWay = "pickup" | "courier"

/** The carriers a way card names. A shop's own courier or pickup is not one. */
export type DeliveryCarrier = "cdek" | "pochta"

/** The order the cards stand in: the cheaper way first. */
export const DELIVERY_WAYS: readonly DeliveryWay[] = ["pickup", "courier"]

type WayOption = { provider_id?: string | null; data?: unknown }

/**
 * The way and carrier of one shipping option, read off the option the store API
 * returned, or `null` for an option that belongs to no card:
 *
 * - a CDEK option by its `data.kind`, courier or a point (an office or a locker);
 * - a Russian Post option always goes to a point;
 * - the shop's own tariff named after Russian Post (`data.carrier`
 *   `post_ru`, «Почта России — до отделения») goes to a point as well, since
 *   the parcel waits at the post office.
 *
 * Every other option (a tariff of the shop's own courier or pickup, DHL, a
 * CDEK tariff of the shop's that names no way) stays a row of its own.
 */
export const deliveryWayOf = (
  option?: WayOption | null
): { way: DeliveryWay; carrier: DeliveryCarrier } | null => {
  if (!option) return null
  if (isCdekOption(option)) {
    return { way: cdekKindOf(option) === "courier" ? "courier" : "pickup", carrier: "cdek" }
  }
  if (isPochtaOption(option)) {
    return { way: "pickup", carrier: "pochta" }
  }
  if (option.provider_id === TARIFF_PROVIDER_ID) {
    const carrier = (option.data as { carrier?: unknown } | null)?.carrier
    if (carrier === "post_ru") return { way: "pickup", carrier: "pochta" }
  }
  return null
}

export type DeliveryWayCard<T> = {
  way: DeliveryWay
  /** Every carrier with an option in this card, in the order of the options. */
  carriers: DeliveryCarrier[]
  options: T[]
}

/**
 * Groups the options the store API returned into way cards. A card exists only
 * when at least one option of its way came back, so a carrier that has no
 * courier tariff for this address adds nothing to the courier card.
 *
 * Returns `null` when no carrier integration (CDEK, Russian Post) answered:
 * a shop of the shop's own tariffs alone, and the international shop with its
 * one DHL method, keep the plain list they had. `rest` holds the options that
 * belong to no card, in the order they came, to be shown as rows after the
 * cards.
 */
export const groupDeliveryWays = <T extends WayOption>(
  options: T[]
): { cards: DeliveryWayCard<T>[]; rest: T[] } | null => {
  if (!options.some((option) => isCdekOption(option) || isPochtaOption(option))) {
    return null
  }
  const byWay = new Map<DeliveryWay, DeliveryWayCard<T>>()
  const rest: T[] = []
  for (const option of options) {
    const placed = deliveryWayOf(option)
    if (!placed) {
      rest.push(option)
      continue
    }
    const card = byWay.get(placed.way) ?? { way: placed.way, carriers: [], options: [] }
    if (!card.carriers.includes(placed.carrier)) card.carriers.push(placed.carrier)
    card.options.push(option)
    byWay.set(placed.way, card)
  }
  const cards = DELIVERY_WAYS.flatMap((way) => {
    const card = byWay.get(way)
    return card ? [card] : []
  })
  return { cards, rest }
}

/**
 * The «от N ₽» of a card: the lowest price among its options that have one.
 * `null` while none is known (prices still loading, no address yet, every
 * carrier failed), and the card then shows no number at all.
 */
export const lowestDeliveryPrice = (amounts: Array<number | null>): number | null => {
  const known = amounts.filter((amount): amount is number => typeof amount === "number")
  return known.length ? Math.min(...known) : null
}

/**
 * Whether the cart's (or the order's) shipping method is one of the tariffs the
 * way cards offer, read off the `data` its provider wrote: `provider` for CDEK
 * and Russian Post, `carrier` for the shop's own Russian Post tariff. The order
 * summary names such a tariff and its point; a DHL or own-courier method keeps
 * the summary it had.
 */
export const isWayCardMethod = (method?: { data?: unknown } | null): boolean => {
  const data = method?.data as { provider?: unknown; carrier?: unknown } | null | undefined
  return data?.provider === "cdek" || data?.provider === "pochta" || data?.carrier === "post_ru"
}
