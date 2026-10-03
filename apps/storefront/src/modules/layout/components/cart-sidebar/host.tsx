import { retrieveCart } from "@lib/data/cart"
import { getSiteName } from "@lib/data/cookies"
import { retrieveCustomer } from "@lib/data/customer"
import { getLegalLinkContext } from "@lib/data/legal-links"
import { getTelegramBot } from "@lib/data/telegram-bot"
import { getSiteLoginSettings } from "@lib/data/tenant-login-settings"
import { getWishlistProductIds, isWishlistCustomerLoggedIn } from "@lib/data/wishlist"

import CartSidebar from "."

/**
 * The one place the cart sidebar is rendered (`(main)/layout.tsx`), with everything it
 * shows besides the cart: whether the buyer is signed in (the guest block), which
 * sign-in methods this shop offers, the shop's name and legal pages for the sign-up form's
 * consent sentence, and the wishlist state for the hearts on the lines.
 * The reads are the cookie-keyed, cached ones the product cards and the header already
 * make on the same request; the delivery estimate is fetched on open instead
 * (`getCartDeliveryDays`). Async, so the layout keeps it behind a `Suspense`.
 */
export default async function CartSidebarHost() {
  const [cart, customer, wishlistLoggedIn, wishlistProductIds, loginSettings, telegramBot, siteName, legal] =
    await Promise.all([
      retrieveCart().catch(() => null),
      retrieveCustomer().catch(() => null),
      isWishlistCustomerLoggedIn().catch(() => false),
      getWishlistProductIds().catch(() => [] as string[]),
      getSiteLoginSettings(),
      getTelegramBot(),
      getSiteName(),
      getLegalLinkContext(),
    ])

  return (
    <CartSidebar
      cart={cart}
      isLoggedIn={customer !== null}
      wishlistLoggedIn={wishlistLoggedIn}
      wishlistProductIds={wishlistProductIds}
      loginSettings={loginSettings}
      telegramBot={telegramBot}
      siteName={siteName}
      legal={legal}
    />
  )
}
