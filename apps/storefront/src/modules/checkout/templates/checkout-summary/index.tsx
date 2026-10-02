import { getLegalLinkContext } from "@lib/data/legal-links"
import { listCartPaymentMethods } from "@lib/data/payment"
import { getTenantManualPayment } from "@lib/data/tenant-manual-payment"
import { getSitePaymentMethods } from "@lib/data/tenant-payment-methods"
import { PICKUP_METADATA_KEYS } from "@lib/theme/composition"
import type { HttpTypes } from "@medusajs/types"
import { Text } from "@medusajs/ui"
import { getTranslations } from "next-intl/server"
import { isNoDeliveryLine } from "@lib/util/shipping-address"
import CheckoutPickupSummary from "@modules/checkout/components/checkout-pickup-summary"
import DiscountCode from "@modules/checkout/components/discount-code"
import CheckoutPaymentSection from "@modules/checkout/components/checkout-payment-section"
import CheckoutTotals from "@modules/checkout/components/checkout-totals"

const CheckoutSummary = async ({
  cart,
  customer,
}: {
  cart: HttpTypes.StoreCart
  customer: HttpTypes.StoreCustomer | null
}) => {
  // Batch 6: a course in the cart — the access note under the totals (Q3.2), and a
  // guest cannot pay for it before signing in (Q3.1, the pay button stays disabled).
  const hasCourse = (cart.items ?? []).some(isNoDeliveryLine)
  const requiresSignIn = hasCourse && !customer
  const tShip = await getTranslations("Shipments")
  const [paymentMethods, legal, manualPayment, tenantPaymentMethods] = await Promise.all([
    listCartPaymentMethods(cart.region?.id ?? ""),
    // The consent sentence under the Pay button names four documents; this is
    // where the shop's own pages are read for it, because the section itself is
    // a client component (rule 19g, f05-checkout-legal-stubs).
    getLegalLinkContext(),
    // The shop's crypto wallets and manager contacts for the manual provider
    // (olavka-payments), read from the tenant header here for the same reason.
    getTenantManualPayment(),
    // t-2026-09-24-n10: which methods this shop connected, so the manual
    // provider's demo card can be labelled honestly once it is offered only
    // as a last resort.
    getSitePaymentMethods(),
  ])
  const meta = cart.metadata as Record<string, string> | null
  const pickupPointName = meta?.[PICKUP_METADATA_KEYS.name]
  const pickupPointAddress = meta?.[PICKUP_METADATA_KEYS.address]

  return (
    // t-2026-10-01-checkout-ivan-3 #5: full width — the page itself no
    // longer caps it ((checkout)/checkout/page.tsx); each child below
    // constrains its OWN content to the 736px column instead
    // (.checkout-section-container, globals.css), except `CheckoutPaymentSection`,
    // which does the same split internally so its method row can bleed past
    // it the way the delivery row does.
    <div className="flex flex-col gap-y-8 py-4 lg:py-10 bg-ui-bg-subtle lg:bg-transparent">
      <div className="checkout-section-container flex flex-col gap-y-3">
        <CheckoutTotals cart={cart} />
        {hasCourse && (
          <Text size="small" className="text-ui-fg-subtle" data-testid="checkout-access-note">
            {tShip("accessByEmail")}
          </Text>
        )}
      </div>

      {pickupPointName && (
        <div className="checkout-section-container">
          <CheckoutPickupSummary
            name={pickupPointName}
            address={pickupPointAddress ?? ""}
          />
        </div>
      )}

      <div className="checkout-section-container">
        <DiscountCode cart={cart} />
      </div>

      <CheckoutPaymentSection
        cart={cart}
        availablePaymentMethods={paymentMethods ?? []}
        legal={legal}
        manualPayment={manualPayment}
        tenantPaymentMethods={tenantPaymentMethods}
        requiresSignIn={requiresSignIn}
      />
    </div>
  )
}

export default CheckoutSummary
