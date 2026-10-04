import type { CartSnapshot } from "@lib/cart-store"

import EmptyCartMessage from "../components/empty-cart-message"
import OrderErrorBanner from "../components/order-error-banner"
import CartContent from "./content"

/**
 * The cart page. The banner and the empty-cart message are server-rendered; the lines
 * and the summary are `CartContent`, drawn from the client cart queue
 * (t-2026-10-03-66) so a quantity changed here, in the sidebar or on a product page
 * shows the same everywhere without a reload.
 */
const CartTemplate = ({
  snapshot,
  error,
  wishlistLoggedIn,
  wishlistProductIds,
}: {
  snapshot: CartSnapshot
  error?: string
  wishlistLoggedIn: boolean
  wishlistProductIds: readonly string[]
}) => {
  return (
    <div className="overflow-x-hidden lg:py-10">
      <OrderErrorBanner error={error} />
      <div className="content-container" data-testid="cart-container">
        <CartContent
          snapshot={snapshot}
          empty={<EmptyCartMessage />}
          wishlistLoggedIn={wishlistLoggedIn}
          wishlistProductIds={wishlistProductIds}
        />
      </div>
    </div>
  )
}

export default CartTemplate
