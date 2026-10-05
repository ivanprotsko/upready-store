import { listCartShippingMethods } from "@lib/data/fulfillment"
import { listShopRegions } from "@lib/data/regions"
import { getCountryCode } from "@lib/data/cookies"
import { retrieveCustomerAddresses } from "@lib/data/customer"
import { cartNeedsShipping, isNoDeliveryLine } from "@lib/util/shipping-address"
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
import { getLocale } from "next-intl/server"

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

  const [shippingOptions, regions, currentCountry, addresses, locale] =
    await Promise.all([
      listCartShippingMethods(cart.id),
      listShopRegions(),
      getCountryCode(),
      retrieveCustomerAddresses(),
      getLocale(),
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
  // Batch 7: every checkout needs an account before paying (batch 6 asked it of a
  // course cart only); a course retitles the block.
  const hasCourse = (cart.items ?? []).some(isNoDeliveryLine)

  return (
    // Batch 6 part 1: the left column of the two (page.tsx); the order composition
    // moved to the summary on the right, the shipping and returns links under the
    // payment block (`CheckoutPayment`).
    <div className="flex flex-col gap-y-6">
      {/* SignInPrompt is async, and everything after the shipping options comes
          past Flight's 3200-byte row limit, so this <div>'s children arrive as
          lazy rows: one slot around all of them, see HydrationSlot (46df U-06). */}
      <HydrationSlot>
        <RobokassaRetryNotice cart={cart} notice={paymentNotice} />
        {!customer && (
          <CheckoutSignIn returnTo={`/${locale}/checkout`} hasCourse={hasCourse} />
        )}

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
            />
          )}
          {!isDigital && (
            <CheckoutShippingSection
              cart={cart}
              availableShippingOptions={shippingOptions}
              regions={regions ?? []}
              currentCountry={resolvedCountry}
            />
          )}
          <CheckoutContactsRow cart={cart} />
          {!isDigital && <CheckoutPickupPointSheet />}
        </PickupSheetProvider>
      </HydrationSlot>
    </div>
  )
}
