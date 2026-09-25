import { getLegalLinkContext } from "@lib/data/legal-links"
import { listCartPaymentMethods } from "@lib/data/payment"
import { getTenantManualPayment } from "@lib/data/tenant-manual-payment"
import { getSitePaymentMethods } from "@lib/data/tenant-payment-methods"
import { PICKUP_METADATA_KEYS } from "@lib/theme/composition"
import type { HttpTypes } from "@medusajs/types"
import CheckoutPickupSummary from "@modules/checkout/components/checkout-pickup-summary"
import DiscountCode from "@modules/checkout/components/discount-code"
import CheckoutPaymentSection from "@modules/checkout/components/checkout-payment-section"
import CheckoutTotals from "@modules/checkout/components/checkout-totals"

const CheckoutSummary = async ({ cart }: { cart: HttpTypes.StoreCart }) => {
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
    <div className="flex flex-col gap-y-8 px-4 py-4 lg:py-10 bg-ui-bg-subtle lg:bg-transparent">
      <CheckoutTotals cart={cart} />

      {pickupPointName && (
        <CheckoutPickupSummary
          name={pickupPointName}
          address={pickupPointAddress ?? ""}
        />
      )}

      <DiscountCode cart={cart} />

      <CheckoutPaymentSection
        cart={cart}
        availablePaymentMethods={paymentMethods ?? []}
        legal={legal}
        manualPayment={manualPayment}
        tenantPaymentMethods={tenantPaymentMethods}
      />
    </div>
  )
}

export default CheckoutSummary
