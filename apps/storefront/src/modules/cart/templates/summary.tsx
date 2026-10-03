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
 */
const Summary = ({ cart }: SummaryProps) => {
  const t = useTranslations("CartSummary")
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
    <div className="flex flex-col gap-y-8">
      <CartTotals totals={cart} needsShipping={cartNeedsShipping(cart)} />
      <DiscountCode cart={cart} />
      <Button
        className="w-full"
        size="large"
        isLoading={leaving}
        onClick={goToCheckout}
        data-testid="checkout-button"
      >
        {t("goToCheckout")}
      </Button>
    </div>
  )
}

export default Summary
