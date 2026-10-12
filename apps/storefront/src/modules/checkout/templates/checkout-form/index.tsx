import { listCartShippingMethods } from "@lib/data/fulfillment"
import { listShopRegions } from "@lib/data/regions"
import { getCountryCode } from "@lib/data/cookies"
import { retrieveCustomerAddresses } from "@lib/data/customer"
import { cartNeedsShipping } from "@lib/util/shipping-address"
import { checkoutStepLocksOf } from "@lib/util/checkout-steps"
import CheckoutSignIn from "@modules/checkout/components/checkout-sign-in"
import type { HttpTypes } from "@medusajs/types"
import CheckoutShippingSection from "@modules/checkout/components/checkout-shipping-section"
import CheckoutAddressRow from "@modules/checkout/components/checkout-address-row"
import CheckoutContactsRow from "@modules/checkout/components/checkout-contacts-row"
import CheckoutPickupPointSheet from "@modules/checkout/components/checkout-pickup-point-sheet"
import RobokassaRetryNotice from "@modules/checkout/components/robokassa-retry-notice"
import type { PaymentReturnNotice } from "@lib/util/robokassa-return"
import { PickupSheetProvider } from "@modules/checkout/context/pickup-sheet-context"
import HydrationSlot from "@modules/common/components/hydration-slot"

export default async function CheckoutForm({
  cart,
  customer,
  paymentNotice = null,
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
  /** What Robokassa's return said, from the page's `?payment=` (t-2026-10-04-48). */
  paymentNotice?: PaymentReturnNotice | null
}) {
  if (!cart) return null

  const [shippingOptions, regions, currentCountry, addresses] =
    await Promise.all([
      listCartShippingMethods(cart.id),
      listShopRegions(),
      getCountryCode(),
      retrieveCustomerAddresses(),
    ])

  const resolvedCountry =
    currentCountry ||
    cart.shipping_address?.country_code ||
    cart.region?.countries?.[0]?.iso_2 ||
    ""

  // o24-courses: a cart of only digital products has its delivery already
  // decided (`ensureDigitalDelivery`, reached via a redirect through
  // `app/api/checkout/digital-delivery` before this template ever renders) —
  // no shipping-method picker, no pickup sheet, no address row, just the
  // contacts row `CheckoutInfoRows` still shows.
  const isDigital = !cartNeedsShipping(cart)
  // t-2026-10-09-56 (Ivan's item 7): each section opens once the ones before it
  // are done, read off the cart (`checkoutStepLocksOf`); the payment template
  // asks the same question for its own block. t-2026-10-12-05: the sign-in is the
  // first of them, so a guest sees no address field (Ivan 12.10, item 6.3).
  const locks = checkoutStepLocksOf(cart, shippingOptions, customer !== null)

  return (
    // Batch 6 part 1: the left column of the two (page.tsx); the order composition
    // moved to the summary on the right, the shipping and returns links under the
    // payment block (`CheckoutPayment`).
    <div className="flex flex-col gap-y-6">
      {/* Everything after the shipping options comes past Flight's 3200-byte row
          limit, so this <div>'s children arrive as lazy rows: one slot around all of
          them, see HydrationSlot (46df U-06). */}
      <HydrationSlot>
        <RobokassaRetryNotice cart={cart} notice={paymentNotice} />
        {/* t-2026-10-12-05 (Ivan 12.10, items 6.4 and 6.4.1): «Вход в личный кабинет»
            is the first step for every cart, and it stays after the sign-in. */}
        <CheckoutSignIn
          customer={
            customer
              ? {
                  email: customer.email,
                  first_name: customer.first_name,
                  last_name: customer.last_name,
                  metadata: customer.metadata ?? null,
                }
              : null
          }
        />

        {/* t-2026-10-01-checkout-ivan-3 #6: address above delivery method,
            contacts after it — «Адрес доставки» → «Способ доставки» →
            «Контакты». Neither address nor the method picker exists for a
            digital-only cart (o24-courses); contacts always do. */}
        <PickupSheetProvider cart={cart} shippingOptions={shippingOptions}>
          {!isDigital && (
            <CheckoutAddressRow
              cart={cart}
              addresses={addresses}
              availableShippingMethods={shippingOptions}
              locked={locks.address}
            />
          )}
          {!isDigital && (
            <CheckoutShippingSection
              cart={cart}
              availableShippingOptions={shippingOptions}
              regions={regions ?? []}
              currentCountry={resolvedCountry}
              locked={locks.shipping}
            />
          )}
          <CheckoutContactsRow cart={cart} locked={locks.contacts} />
          {!isDigital && <CheckoutPickupPointSheet />}
        </PickupSheetProvider>
      </HydrationSlot>
    </div>
  )
}
