import { retrieveCart } from "@lib/data/cart"
import { retrieveCustomer } from "@lib/data/customer"
import { isDigitalDeliveryCart } from "@lib/util/shipping-address"
import PaymentWrapper from "@modules/checkout/components/payment-wrapper"
import { CartUpdateProvider } from "@modules/checkout/context/cart-update-context"
import CheckoutForm from "@modules/checkout/templates/checkout-form"
import CheckoutSummary from "@modules/checkout/templates/checkout-summary"
import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
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
  const initialCart = await retrieveCart()

  if (!initialCart) {
    return notFound()
  }

  if (
    isDigitalDeliveryCart(initialCart) &&
    (initialCart.shipping_methods?.length ?? 0) === 0
  ) {
    const locale = await getLocale()
    redirect(`/api/checkout/digital-delivery?locale=${locale}`)
  }

  const cart = initialCart
  const customer = await retrieveCustomer()

  return (
    <PaymentWrapper cart={cart}>
      <CartUpdateProvider>
        <div className="overflow-x-hidden">
          <div className="lg:content-container flex flex-col lg:grid lg:grid-cols-[7fr_5fr] min-h-screen">
            <CheckoutForm cart={cart} customer={customer} />
            <CheckoutSummary cart={cart} />
          </div>
        </div>
      </CartUpdateProvider>
    </PaymentWrapper>
  )
}
