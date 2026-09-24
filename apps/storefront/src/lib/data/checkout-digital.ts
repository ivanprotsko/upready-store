"use server"

/**
 * o24-courses part (c): a cart holding only digital products skips the
 * delivery step entirely — no shipping-method picker, no address sheet. But
 * Medusa v2 still requires a real shipping method on the cart before
 * `completeCartWorkflow` will place the order (no `requires_shipping` concept
 * on the product — `apps/backend/scripts/fixtures/o24-seed-courses.ts`'s own
 * comment), so this attaches the tenant's ₽0 "Цифровая доставка" option
 * (`o24-seed-digital-shipping-option.ts`, found by its
 * `metadata.digital_delivery` marker rather than its name, which an owner
 * can rename from /shipping) and blanks the address the same way
 * `pickup-sheet-context.tsx`'s `choosePoint` already does for a pickup cart —
 * an empty-string address object, not `null`, because `PaymentButton`'s
 * `notReady` (`checkout/components/payment-button/index.tsx`) requires
 * `cart.shipping_address` to be truthy regardless of delivery method.
 *
 * Called from `app/api/checkout/digital-delivery/route.ts`, NOT from the
 * checkout page's own render: this function reaches `setShippingMethod` /
 * `updateCart`, both of which call `revalidateTag`, and Next.js forbids that
 * during a Server Component render. The page only reads the cart and
 * redirects here the one time a digital cart has no shipping method yet; a
 * no-op once it does.
 */

import { retrieveCart, setShippingMethod, updateCart } from "./cart"
import { retrieveCustomer } from "./customer"
import { listCartShippingMethods } from "./fulfillment"
import { isDigitalDeliveryCart } from "@lib/util/shipping-address"
import type { HttpTypes } from "@medusajs/types"

const DIGITAL_DELIVERY_METADATA_KEY = "digital_delivery"

const isDigitalDeliveryOption = (
  option: HttpTypes.StoreCartShippingOption
): boolean =>
  // `metadata` is fetched (`+metadata`, `lib/data/fulfillment.ts`) but is not
  // part of the SDK's `StoreCartShippingOption` type, the same gap that type
  // has for `service_zone` (`StoreCartShippingOptionWithServiceZone`).
  (option as unknown as { metadata?: Record<string, unknown> | null })
    .metadata?.[DIGITAL_DELIVERY_METADATA_KEY] === "true"

export async function ensureDigitalDelivery(
  cart: HttpTypes.StoreCart
): Promise<HttpTypes.StoreCart> {
  if (!isDigitalDeliveryCart(cart)) return cart
  if ((cart.shipping_methods?.length ?? 0) > 0) return cart

  const options = await listCartShippingMethods(cart.id)
  const digitalOption = options?.find(isDigitalDeliveryOption)

  if (!digitalOption) {
    // Tolerating, not hiding (rule 20): the seed script was never run for
    // this tenant/environment. The checkout falls back to its normal
    // delivery step rather than a hard failure — `isDigitalDeliveryCart`
    // callers everywhere else still treat the cart as digital, so the buyer
    // would see an address form asking for a city to ship a course to; a
    // known gap, not a silent one, logged once here.
    console.error(
      'ensureDigitalDelivery: no shipping option carries metadata.digital_delivery="true"; run o24-seed-digital-shipping-option.ts for this tenant'
    )
    return cart
  }

  await setShippingMethod({
    cartId: cart.id,
    shippingMethodId: digitalOption.id,
  })

  // Name/phone come from the logged-in customer, not left blank like pickup's
  // blanked address does: `checkout-billing-sheet.tsx` always copies THESE
  // three fields from `shipping_address` into `billing_address` regardless of
  // its own "same as shipping" toggle, so a blank name/phone here would reach
  // the order's billing address too — a course buyer is authenticated anyway
  // (the entitlement is customer-scoped), so this is never a guest cart.
  const addr = cart.shipping_address
  const customer = await retrieveCustomer()
  await updateCart({
    shipping_address: {
      first_name: addr?.first_name || customer?.first_name || "",
      last_name: addr?.last_name || customer?.last_name || "",
      phone: addr?.phone || customer?.phone || "",
      country_code:
        addr?.country_code || cart.region?.countries?.[0]?.iso_2 || "",
      company: "",
      address_1: "",
      address_2: "",
      city: "",
      postal_code: "",
      province: "",
    },
  } as HttpTypes.StoreUpdateCart)

  return (await retrieveCart(cart.id)) ?? cart
}
