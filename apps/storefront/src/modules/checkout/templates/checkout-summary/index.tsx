import { listCartPaymentMethods } from "@lib/data/payment"
import type { HttpTypes } from "@medusajs/types"
import CheckoutPickupSummary from "@modules/checkout/components/checkout-pickup-summary"
import DiscountCode from "@modules/checkout/components/discount-code"
import CheckoutPaymentSection from "@modules/checkout/components/checkout-payment-section"
import CheckoutTotals from "@modules/checkout/components/checkout-totals"

const CheckoutSummary = async ({ cart }: { cart: HttpTypes.StoreCart }) => {
  const paymentMethods = await listCartPaymentMethods(cart.region?.id ?? "")
  const meta = cart.metadata as Record<string, string> | null
  const pickupPointName = meta?.pickup_point_name
  const pickupPointAddress = meta?.pickup_point_address

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
      />
    </div>
  )
}

export default CheckoutSummary
