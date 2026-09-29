import type { HttpTypes } from "@medusajs/types"
import { PICKUP_METADATA_KEYS } from "@lib/theme/composition"

/**
 * The shipping address fields a carrier needs before a parcel can be posted.
 *
 * f04-address-without-city: the checkout used to collect `address_1` alone
 * whenever no address suggest provider was configured, so an order could be
 * paid for with an empty `city` and `postal_code` (measured live on
 * `cherkashino.shipshift.dev`, order #5, 2026-09-15). Russian Post and СДЭК
 * both refuse a shipment without city and index, so the shop owner was left
 * with an order nobody could send.
 *
 * `province` is not universal: most countries address a parcel without one.
 * It is required exactly where the backend ships a region list for the
 * country (`apps/backend/src/shipping-tariffs/ru-regions.ts`'s
 * `REGIONS_BY_COUNTRY`, served by `GET /store/shipping-methods/regions`),
 * because a zone restricted to regions matches on that string. Today that is
 * Russia. Adding a country there means adding it here, and to the backend's
 * own gate in `workflows/hooks/validate-cart-shipping-address.ts`.
 */
export const COUNTRIES_REQUIRING_PROVINCE = ["ru"]

export type ShippingAddressField =
  | "address_1"
  | "postal_code"
  | "city"
  | "province"

export const requiresProvince = (countryCode?: string | null) =>
  COUNTRIES_REQUIRING_PROVINCE.includes((countryCode ?? "").toLowerCase())

type AddressLike = {
  address_1?: string | null
  postal_code?: string | null
  city?: string | null
  province?: string | null
}

/**
 * Which postable fields the address is still missing. An empty array means the
 * address can be handed to a carrier.
 */
export const shippingAddressGaps = (
  address: AddressLike | null | undefined,
  countryCode?: string | null
): ShippingAddressField[] => {
  const required: ShippingAddressField[] = [
    "address_1",
    "postal_code",
    "city",
    ...(requiresProvince(countryCode) ? (["province"] as const) : []),
  ]

  return required.filter((field) => !address?.[field]?.trim())
}

/**
 * Which `CheckoutPage` sentences the address form shows for these gaps. The
 * province gets its own: it is a list to pick from, not a field to type, and
 * the general sentence names only city and index (U-08, 46df UX audit).
 */
export const addressGapMessageKeys = (
  gaps: ShippingAddressField[]
): ("addressIncomplete" | "provinceRequired")[] => [
  ...(gaps.some((field) => field !== "province") ? (["addressIncomplete"] as const) : []),
  ...(gaps.includes("province") ? (["provinceRequired"] as const) : []),
]

/**
 * A cart the customer sends to a pickup point carries no delivery address at
 * all: `pickup-sheet-context.tsx` blanks every address field on purpose and
 * writes the point onto `cart.metadata`, and `checkout-info-rows` hides the
 * address row. Such a cart has nothing to complete, so the gate stays quiet.
 * The backend decides the same question from the shipping option's own
 * fulfillment set, which no browser can forge.
 */
export const isPickupCart = (cart: HttpTypes.StoreCart) =>
  Boolean(
    (cart.metadata as Record<string, unknown> | null | undefined)?.[
      PICKUP_METADATA_KEYS.id
    ]
  )

/**
 * A cart holding only digital products (o24-courses: `metadata.digital ===
 * "true"` on the product, the seed's own contract — `o24-seed-courses.ts`).
 * Such a cart has nothing to post either, the same way a pickup cart does
 * not: `ensureDigitalDelivery` (`lib/data/checkout-digital.ts`) blanks its
 * address and attaches the tenant's ₽0 "Цифровая доставка" shipping option
 * on the checkout page's first render, before the buyer sees anything.
 * Derived from the items themselves rather than a cart-metadata flag —
 * unlike pickup, which shipping method to use is not the buyer's choice.
 */
export const isDigitalDeliveryCart = (cart: HttpTypes.StoreCart): boolean => {
  const items = cart.items ?? []
  if (items.length === 0) return false

  return items.every(
    (item) =>
      (item.product?.metadata as Record<string, unknown> | null | undefined)
        ?.digital === "true"
  )
}

/**
 * The gaps that keep this cart from being paid for. Reads the cart's own
 * country, so a shop selling outside Russia is not asked for a region it has
 * no list for.
 */
export const cartShippingAddressGaps = (
  cart: HttpTypes.StoreCart
): ShippingAddressField[] => {
  if (isPickupCart(cart) || isDigitalDeliveryCart(cart)) return []

  return shippingAddressGaps(cart.shipping_address, cartCountryCode(cart))
}

/**
 * The country the cart is addressed in. A cart that has never been given an
 * address carries no `country_code` yet, and the region it was opened in is
 * then the only thing that says which country's rules apply.
 */
export const cartCountryCode = (cart: HttpTypes.StoreCart) =>
  cart.shipping_address?.country_code ||
  cart.region?.countries?.[0]?.iso_2 ||
  null
