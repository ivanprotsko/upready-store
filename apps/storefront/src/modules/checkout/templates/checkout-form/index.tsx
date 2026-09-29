import { listCartShippingMethods } from "@lib/data/fulfillment"
import { listRegions } from "@lib/data/regions"
import { getCountryCode } from "@lib/data/cookies"
import { getLegalLinkContext } from "@lib/data/legal-links"
import { legalHref } from "@lib/util/legal-links"
import { retrieveCustomerAddresses } from "@lib/data/customer"
import { isDigitalDeliveryCart } from "@lib/util/shipping-address"
import type { HttpTypes } from "@medusajs/types"
import CheckoutShippingSection from "@modules/checkout/components/checkout-shipping-section"
import CheckoutInfoRows from "@modules/checkout/components/checkout-info-rows"
import CheckoutItemList from "@modules/checkout/components/checkout-item-list"
import CheckoutPickupPointSheet from "@modules/checkout/components/checkout-pickup-point-sheet"
import SignInPrompt from "@modules/checkout/components/sign-in-prompt"
import RobokassaRetryNotice from "@modules/checkout/components/robokassa-retry-notice"
import { PickupSheetProvider } from "@modules/checkout/context/pickup-sheet-context"
import { Link } from "@i18n/navigation"
import { getTranslations } from "next-intl/server"

export default async function CheckoutForm({
  cart,
  customer,
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
}) {
  if (!cart) return null

  const [shippingOptions, regions, currentCountry, addresses, t, legal] =
    await Promise.all([
      listCartShippingMethods(cart.id),
      listRegions(),
      getCountryCode(),
      retrieveCustomerAddresses(),
      getTranslations("CheckoutPage"),
      getLegalLinkContext(),
    ])

  // Navigation links, not consent: each one is shown only while the shop has a
  // page behind it. Before f05-checkout-legal-stubs both went to the starter's
  // placeholder routes, so a shop that never wrote its shipping terms still
  // offered the buyer a page saying so in English (rule 20 — the same fix as
  // the consent sentence above it, at every call site).
  const shippingLink = legalHref("shipping", legal)
  const returnsLink = legalHref("returns", legal)

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
  const isDigital = isDigitalDeliveryCart(cart)

  return (
    <div className="flex flex-col px-4 py-6 lg:px-0 lg:py-10 gap-y-6">
      <RobokassaRetryNotice cart={cart} />
      {!customer && <SignInPrompt />}

      <PickupSheetProvider cart={cart} shippingOptions={shippingOptions}>
        {!isDigital && (
          <CheckoutShippingSection
            cart={cart}
            availableShippingOptions={shippingOptions}
            regions={regions ?? []}
            currentCountry={resolvedCountry}
          />
        )}
        <CheckoutInfoRows
          cart={cart}
          customer={customer}
          addresses={addresses}
          availableShippingMethods={shippingOptions}
          isDigital={isDigital}
        />
        {!isDigital && <CheckoutPickupPointSheet />}
      </PickupSheetProvider>

      <CheckoutItemList cart={cart} />

      {(shippingLink || returnsLink) && (
        <div className="hidden lg:flex gap-x-4 mt-auto">
          {shippingLink && (
            <Link
              href={shippingLink}
              className="txt-medium text-ui-fg-base hover:text-ui-fg-subtle transition-colors"
            >
              {t("shippingLink")}
            </Link>
          )}
          {returnsLink && (
            <Link
              href={returnsLink}
              className="txt-medium text-ui-fg-base hover:text-ui-fg-subtle transition-colors"
            >
              {t("returnsLink")}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
