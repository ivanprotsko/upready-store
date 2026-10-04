import { retrieveCart } from "@lib/data/cart"
import { retrieveCustomer } from "@lib/data/customer"
import { cartHasStaleShipping, cartNeedsShipping } from "@lib/util/shipping-address"
import PaymentWrapper from "@modules/checkout/components/payment-wrapper"
import { CartUpdateProvider } from "@modules/checkout/context/cart-update-context"
import CheckoutForm from "@modules/checkout/templates/checkout-form"
import CheckoutPayment from "@modules/checkout/templates/checkout-payment"
import CheckoutSummary from "@modules/checkout/templates/checkout-summary"
import HydrationSlot from "@modules/common/components/hydration-slot"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { pageTitle } from "@lib/util/page-title"
import { readPaymentReturnNotice } from "@lib/util/robokassa-return"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata.checkout")

  return {
    title: await pageTitle(t("title")),
    description: t("description"),
  }
}

type CheckoutPageProps = {
  searchParams: Promise<{ digital?: string; payment?: string }>
}

export default async function Checkout({ searchParams }: CheckoutPageProps) {
  const [initialCart, locale, params] = await Promise.all([
    retrieveCart(),
    getLocale(),
    searchParams,
  ])

  // A-11 (46df audit): no cart is not a 404 — a buyer whose cart expired, or who
  // bookmarked /checkout, is better sent to the cart (empty or not, with its own
  // "browse products" way forward) than told the page does not exist.
  if (!initialCart) {
    redirect(`/${locale}/cart`)
  }

  // A cart with nothing to post (batch 6, hotfix Plan B) gets the tenant's ₽0 digital
  // option attached by the route handler, once. `?digital=skipped` is the handler's
  // answer that there was nothing to attach (no such option on this shop): the page
  // then renders as it is instead of redirecting again — that was the loop. A cart
  // that still ships something takes the normal delivery step. A cart with nothing to
  // post that still carries a paid method from a removed physical item goes through
  // the same handler, which drops it first (t-2026-10-04-23): the payment step must
  // not show that charge, and place-order would fail on it.
  if (
    params.digital !== "skipped" &&
    ((!cartNeedsShipping(initialCart) &&
      (initialCart.shipping_methods?.length ?? 0) === 0) ||
      cartHasStaleShipping(initialCart))
  ) {
    redirect(`/api/checkout/digital-delivery?locale=${locale}`)
  }

  const cart = initialCart
  const customer = await retrieveCustomer()

  return (
    <PaymentWrapper cart={cart}>
      <CartUpdateProvider>
        {/* Batch 6 part 1: the page was one 736px column with empty sides at 1440 and
            the summary in the middle of the form. From 1024 px it is two columns now,
            the Medusa starter checkout's own split: the form and the payment on the
            left, the order summary on the right, sticky under the 64px header. Below
            1024 px it stays one column in the old order: form, summary, payment. */}
        <div className="content-container grid grid-cols-1 gap-y-8 py-6 small:grid-cols-[minmax(0,1fr)_400px] small:grid-rows-[auto_1fr] small:gap-x-12 small:gap-y-10 small:py-10 large:gap-x-20">
          <div className="min-w-0 small:col-start-1 small:row-start-1">
            <HydrationSlot>
              {/* Back from Robokassa (t-2026-10-04-48): `?payment=failed|pending`. */}
              <CheckoutForm
                cart={cart}
                customer={customer}
                paymentNotice={readPaymentReturnNotice(params.payment)}
              />
            </HydrationSlot>
          </div>
          <div className="min-w-0 small:col-start-2 small:row-start-1 small:row-span-2">
            <div className="small:sticky small:top-24">
              <HydrationSlot>
                <CheckoutSummary cart={cart} />
              </HydrationSlot>
            </div>
          </div>
          <div className="min-w-0 small:col-start-1 small:row-start-2">
            <HydrationSlot>
              <CheckoutPayment cart={cart} customer={customer} />
            </HydrationSlot>
          </div>
        </div>
      </CartUpdateProvider>
    </PaymentWrapper>
  )
}
