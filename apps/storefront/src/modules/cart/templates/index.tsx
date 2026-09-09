import ItemsTemplate from "./items"
import Summary from "./summary"
import EmptyCartMessage from "../components/empty-cart-message"
import OrderErrorBanner from "../components/order-error-banner"
import type { HttpTypes } from "@medusajs/types"

const CartTemplate = ({
  cart,
  error,
}: {
  cart: HttpTypes.StoreCart | null
  error?: string
}) => {
  return (
    <div className="overflow-x-hidden lg:py-10">
      <OrderErrorBanner error={error} />
      <div className="content-container" data-testid="cart-container">
        {cart?.items?.length ? (
          <div className="grid grid-cols-1 small:grid-cols-[7fr_5fr] min-h-[70vh] gap-x-20">
            <div className="flex flex-col py-6 gap-y-6">
              <ItemsTemplate cart={cart} />
            </div>
            <div className="relative">
              <div className="h-full flex flex-col py-6 gap-y-8">
                <div className="sticky top-0">
                  {cart && cart.region && <Summary cart={cart} />}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <EmptyCartMessage />
          </div>
        )}
      </div>
    </div>
  )
}

export default CartTemplate
