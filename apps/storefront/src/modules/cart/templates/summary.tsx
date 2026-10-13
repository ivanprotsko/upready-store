"use client"

import { Button } from "@medusajs/ui"
import { useState } from "react"

import CartTotals from "@modules/common/components/cart-totals"
import { cartNeedsShipping } from "@lib/util/shipping-address"
import DiscountCode from "@modules/checkout/components/discount-code"
import { useCartQueue } from "@lib/cart-store"
import { useRouter } from "@i18n/navigation"
import type { HttpTypes } from "@medusajs/types"
import { useTranslations } from "next-intl"

type SummaryProps = {
  cart: HttpTypes.StoreCart
  /** False for a shop that switched the promo code off (t-2026-10-13-11). */
  promoCode: boolean
}

function getCheckoutStep(cart: HttpTypes.StoreCart) {
  if (!cart?.shipping_address?.address_1 || !cart.email) {
    return "address"
  } else if (cart?.shipping_methods?.length === 0) {
    return "delivery"
  } else {
    return "payment"
  }
}

/**
 * `cart` is the client cart queue's view (t-2026-10-03-66): the totals move with every
 * click as an estimate and settle on the server's numbers once it answers. The checkout
 * button waits for the queue to empty before it leaves, so the checkout always opens on
 * the cart the server has.
 *
 * One bordered card holds the heading, the promo code, the rows, the total and the
 * button (t-2026-10-06-11), so the summary weighs the same as the list beside it.
 */
const Summary = ({ cart, promoCode }: SummaryProps) => {
  const t = useTranslations("CartSummary")
  const tOrder = useTranslations("OrderSummary")
  const queue = useCartQueue()
  const router = useRouter()
  const [leaving, setLeaving] = useState(false)

  const goToCheckout = async () => {
    setLeaving(true)
    const { ok } = await queue.settle()
    const confirmed = queue.getState().server
    setLeaving(false)
    // A refused line is back at the server's quantity and says why; the buyer sees it
    // before going on.
    if (ok && confirmed) {
      router.push("/checkout?step=" + getCheckoutStep(confirmed))
    }
  }

  return (
    <section
      className="flex flex-col gap-y-4 rounded-lg border border-ui-border-base bg-ui-bg-base p-5 small:p-6"
      data-testid="cart-summary"
    >
      <h2 className="txt-large-plus text-ui-fg-base">{tOrder("heading")}</h2>
      {promoCode && <DiscountCode cart={cart} />}
      <CartTotals
        totals={cart}
        needsShipping={cartNeedsShipping(cart)}
        shippingChosen={(cart.shipping_methods?.length ?? 0) > 0}
        rowsClassName="gap-y-2"
      />
      <Button
        className="w-full"
        size="large"
        isLoading={leaving}
        onClick={goToCheckout}
        data-testid="checkout-button"
      >
        {t("goToCheckout")}
      </Button>
    </section>
  )
}

export default Summary
