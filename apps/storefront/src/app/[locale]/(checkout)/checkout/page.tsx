import { retrieveCart } from "@lib/data/cart"
import { retrieveCustomer } from "@lib/data/customer"
import { isDigitalDeliveryCart } from "@lib/util/shipping-address"
import PaymentWrapper from "@modules/checkout/components/payment-wrapper"
import { CartUpdateProvider } from "@modules/checkout/context/cart-update-context"
import CheckoutForm from "@modules/checkout/templates/checkout-form"
import CheckoutSummary from "@modules/checkout/templates/checkout-summary"
import HydrationSlot from "@modules/common/components/hydration-slot"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { pageTitle } from "@lib/util/page-title"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata.checkout")

  return {
    title: await pageTitle(t("title")),
    description: t("description"),
  }
}

export default async function Checkout() {
  const [initialCart, locale] = await Promise.all([retrieveCart(), getLocale()])

  // A-11 (46df audit): no cart is not a 404 — a buyer whose cart expired, or who
  // bookmarked /checkout, is better sent to the cart (empty or not, with its own
  // "browse products" way forward) than told the page does not exist.
  if (!initialCart) {
    redirect(`/${locale}/cart`)
  }

  if (
    isDigitalDeliveryCart(initialCart) &&
    (initialCart.shipping_methods?.length ?? 0) === 0
  ) {
    redirect(`/api/checkout/digital-delivery?locale=${locale}`)
  }

  const cart = initialCart
  const customer = await retrieveCustomer()

  return (
    <PaymentWrapper cart={cart}>
      <CartUpdateProvider>
        {/* t-2026-10-01-checkout-ivan-3 #5: this wrapper used to cap the whole
            page at 736px (lg:content-container → lg:max-w-checkout), which
            clipped the delivery-card row at that edge. It limits nothing now;
            `CheckoutForm` and `CheckoutSummary` constrain their OWN content to
            that same 736px column per section instead
            (.checkout-section-container, globals.css), so the scroller can
            bleed past it. */}
        <div className="overflow-x-hidden flex flex-col min-h-screen lg:min-h-0">
          <HydrationSlot>
            <CheckoutForm cart={cart} customer={customer} />
          </HydrationSlot>
          <HydrationSlot>
            <CheckoutSummary cart={cart} />
          </HydrationSlot>
        </div>
      </CartUpdateProvider>
    </PaymentWrapper>
  )
}
