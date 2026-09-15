import { getLegalLinkContext } from "@lib/data/legal-links"
import { listCartPaymentMethods } from "@lib/data/payment"
import { PICKUP_METADATA_KEYS } from "@lib/theme/composition"
import type { HttpTypes } from "@medusajs/types"
import CheckoutPickupSummary from "@modules/checkout/components/checkout-pickup-summary"
import DiscountCode from "@modules/checkout/components/discount-code"
import CheckoutPaymentSection from "@modules/checkout/components/checkout-payment-section"
import CheckoutTotals from "@modules/checkout/components/checkout-totals"

const CheckoutSummary = async ({ cart }: { cart: HttpTypes.StoreCart }) => {
  const [paymentMethods, legal] = await Promise.all([
    listCartPaymentMethods(cart.region?.id ?? ""),
    // The consent sentence under the Pay button names four documents; this is
    // where the shop's own pages are read for it, because the section itself is
    // a client component (rule 19g, f05-checkout-legal-stubs).
    getLegalLinkContext(),
  ])
  const meta = cart.metadata as Record<string, string> | null
  const pickupPointName = meta?.[PICKUP_METADATA_KEYS.name]
  const pickupPointAddress = meta?.[PICKUP_METADATA_KEYS.address]

  return (
    <div className="flex flex-col gap-y-8 px-4 py-4 lg:py-10 lg:ps-10  bg-ui-bg-subtle lg:-me-[9999px] lg:pe-[9999px]">
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
      />
    </div>
  )
}

export default CheckoutSummary
