import { retrieveCart } from "@lib/data/cart"
import { retrieveCustomer } from "@lib/data/customer"
import { getTelegramBot } from "@lib/data/telegram-bot"
import { getSiteLoginSettings } from "@lib/data/tenant-login-settings"
import { getWishlistProductIds, isWishlistCustomerLoggedIn } from "@lib/data/wishlist"

import CartSidebar from "."

/**
 * The one place the cart sidebar is rendered (`(main)/layout.tsx`), with everything it
 * shows besides the cart: whether the buyer is signed in (the guest block), which
 * sign-in methods this shop offers, and the wishlist state for the hearts on the lines.
 * The reads are the cookie-keyed, cached ones the product cards and the header already
 * make on the same request; the delivery estimate is fetched on open instead
 * (`getCartDeliveryDays`). Async, so the layout keeps it behind a `Suspense`.
 */
export default async function CartSidebarHost() {
  const [cart, customer, wishlistLoggedIn, wishlistProductIds, loginSettings, telegramBot] =
    await Promise.all([
      retrieveCart().catch(() => null),
      retrieveCustomer().catch(() => null),
      isWishlistCustomerLoggedIn().catch(() => false),
      getWishlistProductIds().catch(() => [] as string[]),
      getSiteLoginSettings(),
      getTelegramBot(),
    ])

  return (
    <CartSidebar
      cart={cart}
      isLoggedIn={customer !== null}
      wishlistLoggedIn={wishlistLoggedIn}
      wishlistProductIds={wishlistProductIds}
      loginSettings={loginSettings}
      telegramBot={telegramBot}
    />
  )
}
