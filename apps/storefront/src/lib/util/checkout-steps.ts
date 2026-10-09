import type { HttpTypes } from "@medusajs/types"
import { PICKUP_METADATA_KEYS } from "@lib/theme/composition"
import { cdekNeedsPoint, chosenCdekPoint } from "@lib/util/cdek"
import { contactsFieldErrors } from "@lib/util/checkout-contacts"
import { isPickupShippingOption } from "@lib/util/fulfillment"
import { chosenPochtaPoint, isPochtaOption } from "@lib/util/pochta"
import { cartNeedsShipping, cartShippingAddressGaps } from "@lib/util/shipping-address"
import { realEmailOrEmpty } from "@lib/util/telegram-contact"

/**
 * The checkout's sections open in order (t-2026-10-09-56, Ivan 09.10: «нужно
 * сделать, чтобы к следующему разделу нельзя было перейти пока предыдущий не будет
 * завершен»): «Адрес доставки» → «Способ доставки» → «Контакты» → payment. A
 * section stays closed, its heading alone, until every section before it is done.
 *
 * «Done» is read off the cart, the same tests each section's own checkmark uses, so
 * the gate and the checkmark never disagree and a reload lands on the same step.
 * A cart with nothing to post has neither the address nor the delivery section.
 */

type ShippingOption = HttpTypes.StoreCartShippingOptionWithServiceZone

const metaOf = (cart: HttpTypes.StoreCart) =>
  (cart.metadata as Record<string, unknown> | null | undefined) ?? {}

const metaString = (cart: HttpTypes.StoreCart, key: string): string => {
  const value = metaOf(cart)[key]
  return typeof value === "string" ? value : ""
}

/** The option of the cart's own shipping method, when the list still offers it. */
export const selectedShippingOption = (
  cart: HttpTypes.StoreCart,
  options: ShippingOption[] | null | undefined
): ShippingOption | null => {
  const id = cart.shipping_methods?.at(-1)?.shipping_option_id
  if (!id) return null
  return (options ?? []).find((option) => option.id === id) ?? null
}

/**
 * The address section's checkmark (`CheckoutAddressRow`): the shop's own pickup
 * point once the method is pickup, else an address a carrier can post to.
 */
export const isAddressStepDone = (
  cart: HttpTypes.StoreCart,
  options: ShippingOption[] | null | undefined
): boolean => {
  if (isPickupShippingOption(selectedShippingOption(cart, options))) {
    return !!metaString(cart, PICKUP_METADATA_KEYS.name)
  }
  return !!cart.shipping_address?.address_1 && cartShippingAddressGaps(cart).length === 0
}

/**
 * The delivery section's checkmark (`CheckoutShippingSection`): a method is on the
 * cart and, for the kinds that cannot ship without one, so is its point.
 */
export const isShippingStepDone = (
  cart: HttpTypes.StoreCart,
  options: ShippingOption[] | null | undefined
): boolean => {
  const option = selectedShippingOption(cart, options)
  if (!option) return false
  if (isPickupShippingOption(option)) return !!metaString(cart, PICKUP_METADATA_KEYS.name)
  if (cdekNeedsPoint(option)) return !!chosenCdekPoint(cart)
  if (isPochtaOption(option)) return !!chosenPochtaPoint(cart)
  return true
}

/** The contacts section's checkmark (`CheckoutContactsRow`), the test its form saves by. */
export const isContactsStepDone = (cart: HttpTypes.StoreCart): boolean => {
  const differentRecipient = metaString(cart, "has_different_recipient") === "true"
  return (
    Object.keys(
      contactsFieldErrors(
        {
          first_name: metaString(cart, "contact_first_name"),
          last_name: metaString(cart, "contact_last_name"),
          email: realEmailOrEmpty(cart.email),
          recipient_first_name: differentRecipient ? cart.shipping_address?.first_name || "" : "",
          recipient_last_name: differentRecipient ? cart.shipping_address?.last_name || "" : "",
        },
        differentRecipient
      )
    ).length === 0
  )
}

export type CheckoutStepsDone = {
  /** False for a cart with nothing to post: no address, no delivery section. */
  needsShipping: boolean
  address: boolean
  shipping: boolean
  contacts: boolean
}

/** Which sections stay closed: each one until every section before it is done. */
export type CheckoutStepLocks = {
  shipping: boolean
  contacts: boolean
  payment: boolean
}

export const checkoutStepLocks = ({
  needsShipping,
  address,
  shipping,
  contacts,
}: CheckoutStepsDone): CheckoutStepLocks => {
  const deliveryDone = !needsShipping || (address && shipping)
  return {
    shipping: needsShipping && !address,
    contacts: !deliveryDone,
    payment: !deliveryDone || !contacts,
  }
}

/** The locks for this cart, every test above in one call. */
export const checkoutStepLocksOf = (
  cart: HttpTypes.StoreCart,
  options: ShippingOption[] | null | undefined
): CheckoutStepLocks =>
  checkoutStepLocks({
    needsShipping: cartNeedsShipping(cart),
    address: isAddressStepDone(cart, options),
    shipping: isShippingStepDone(cart, options),
    contacts: isContactsStepDone(cart),
  })
