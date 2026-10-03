import { listCartShippingMethods } from "@lib/data/fulfillment"
import { listRegions } from "@lib/data/regions"
import { getCountryCode } from "@lib/data/cookies"
import { getLegalLinkContext } from "@lib/data/legal-links"
import { legalHref } from "@lib/util/legal-links"
import { retrieveCustomerAddresses } from "@lib/data/customer"
import { cartNeedsShipping, isNoDeliveryLine } from "@lib/util/shipping-address"
import CheckoutSignIn from "@modules/checkout/components/checkout-sign-in"
import type { HttpTypes } from "@medusajs/types"
import CheckoutShippingSection from "@modules/checkout/components/checkout-shipping-section"
import CheckoutAddressRow from "@modules/checkout/components/checkout-address-row"
import CheckoutContactsRow from "@modules/checkout/components/checkout-contacts-row"
import CheckoutItemList from "@modules/checkout/components/checkout-item-list"
import CheckoutPickupPointSheet from "@modules/checkout/components/checkout-pickup-point-sheet"
import RobokassaRetryNotice from "@modules/checkout/components/robokassa-retry-notice"
import { PickupSheetProvider } from "@modules/checkout/context/pickup-sheet-context"
import HydrationSlot from "@modules/common/components/hydration-slot"
import { Link } from "@i18n/navigation"
import { getLocale, getTranslations } from "next-intl/server"

export default async function CheckoutForm({
  cart,
  customer,
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
}) {
  if (!cart) return null

  const [shippingOptions, regions, currentCountry, addresses, t, legal, locale] =
    await Promise.all([
      listCartShippingMethods(cart.id),
      listRegions(),
      getCountryCode(),
      retrieveCustomerAddresses(),
      getTranslations("CheckoutPage"),
      getLegalLinkContext(),
      getLocale(),
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
  const isDigital = !cartNeedsShipping(cart)
  // Batch 7: every checkout needs an account before paying (batch 6 asked it of a
  // course cart only); a course retitles the block.
  const hasCourse = (cart.items ?? []).some(isNoDeliveryLine)

  return (
    // t-2026-10-01-checkout-ivan-3 #5: full width — each section below
    // constrains its OWN content to the 736px column instead (.checkout-
    // section-container, globals.css); `CheckoutShippingSection` is the one
    // that does not wrap entirely, so its delivery-card row can bleed past it.
    <div className="flex flex-col py-6 lg:py-10 gap-y-6">
      {/* SignInPrompt is async, and everything after the shipping options comes
          past Flight's 3200-byte row limit, so this <div>'s children arrive as
          lazy rows: one slot around all of them, see HydrationSlot (46df U-06). */}
      <HydrationSlot>
        <div className="checkout-section-container">
          <RobokassaRetryNotice cart={cart} />
        </div>
        {!customer && (
          <div className="checkout-section-container">
            <CheckoutSignIn returnTo={`/${locale}/checkout`} hasCourse={hasCourse} />
          </div>
        )}

        {/* t-2026-10-01-checkout-ivan-3 #6: address above delivery method,
            contacts after it — «Адрес доставки» → «Способ доставки» →
            «Контакты». Neither address nor the method picker exists for a
            digital-only cart (o24-courses); contacts always do. */}
        <PickupSheetProvider cart={cart} shippingOptions={shippingOptions}>
          {!isDigital && (
            <div className="checkout-section-container">
              <CheckoutAddressRow
                cart={cart}
                addresses={addresses}
                availableShippingMethods={shippingOptions}
              />
            </div>
          )}
          {!isDigital && (
            <CheckoutShippingSection
              cart={cart}
              availableShippingOptions={shippingOptions}
              regions={regions ?? []}
              currentCountry={resolvedCountry}
            />
          )}
          <div className="checkout-section-container">
            <CheckoutContactsRow cart={cart} />
          </div>
          {!isDigital && <CheckoutPickupPointSheet />}
        </PickupSheetProvider>

        <div className="checkout-section-container">
          <CheckoutItemList cart={cart} />
        </div>

        {(shippingLink || returnsLink) && (
          <div className="hidden lg:flex gap-x-4 mt-auto checkout-section-container">
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
      </HydrationSlot>
    </div>
  )
}
