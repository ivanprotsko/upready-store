import { sdk } from "@lib/config"
import { placeOrder } from "@lib/data/cart"
import { getAuthHeaders, setCartId } from "@lib/data/cookies"
import { isAppLocale, defaultLocale } from "@i18n/config"
import type { HttpTypes } from "@medusajs/types"
import { unstable_rethrow } from "next/navigation"
import { type NextRequest, NextResponse } from "next/server"

/**
 * Robokassa's return (t03-tenant-secrets-robokassa). Robokassa redirects the
 * browser to `SuccessUrl2`/`FailUrl2` (this route, `provider=robokassa`) and,
 * in parallel, posts the Result webhook to the backend, which is the only
 * thing that marks the payment paid and completes the cart. So this branch
 * decides nothing and answers at once (t-2026-10-04-48: it used to hold the
 * buyer on a blank tab for about nine seconds while it retried, then left
 * them on the cart). It puts the cart back into the cookie, then
 *   - a failed payment goes straight back to the checkout, every field and
 *     box as the buyer left them, with a notice (`?payment=failed`);
 *   - a success goes to the shop's waiting page (`[locale]/payment-return`),
 *     which asks the backend for the order for about half a minute and ends
 *     on the confirmation page, or on the checkout with `?payment=pending`.
 * Never the cart: `/<locale>/cart?error=…` is for links already sent.
 */
async function robokassaReturn(req: NextRequest) {
  const { searchParams } = req.nextUrl
  // The public origin the customer is on (`vasya.com`, `<handle>.localhost:8047`),
  // not `req.nextUrl.origin`, which Next normalizes to the dev host.
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host")
  const origin = host ? `${proto}://${host}` : req.nextUrl.origin
  const cartId = searchParams.get("cart_id")
  const requestedLocale = searchParams.get("locale")
  const locale = isAppLocale(requestedLocale) ? requestedLocale : defaultLocale
  const paymentFailed = () =>
    NextResponse.redirect(`${origin}/${locale}/checkout?payment=failed`)

  if (!cartId) {
    return paymentFailed()
  }

  await setCartId(cartId)

  if (searchParams.get("outcome") === "fail") {
    return paymentFailed()
  }

  return NextResponse.redirect(`${origin}/${locale}/payment-return`)
}

export async function GET(req: NextRequest) {
  // BTCPay Server's and Bitcart's «return to store» (ask-20261005-070255-438f)
  // take the same path as Robokassa's success: the backend reads the invoice
  // from the shop's own server, and the waiting page looks for the order it
  // made. Neither sends an `outcome`, so this never reads as a failure.
  const provider = req.nextUrl.searchParams.get("provider")
  if (provider === "robokassa" || provider === "btcpay" || provider === "bitcart") {
    return robokassaReturn(req)
  }

  const { origin, searchParams } = req.nextUrl

  const cartId = searchParams.get("cart_id")
  const requestedLocale = searchParams.get("locale")
  const paymentIntent = searchParams.get("payment_intent")
  const paymentIntentClientSecret = searchParams.get(
    "payment_intent_client_secret"
  )
  const redirectStatus = searchParams.get("redirect_status")

  // Every route in this storefront is locale-prefixed, so the redirects below
  // carry the locale the customer left the site with.
  const locale = isAppLocale(requestedLocale) ? requestedLocale : defaultLocale
  const rejected = () =>
    NextResponse.redirect(`${origin}/${locale}/cart?error=payment_failed`)

  if (!cartId || !paymentIntent || !paymentIntentClientSecret) {
    return rejected()
  }

  const cart = await sdk.client
    .fetch<HttpTypes.StoreCartResponse>(`/store/carts/${cartId}`, {
      method: "GET",
      query: { fields: "payment_collection.payment_sessions.data" },
      headers: { ...(await getAuthHeaders()) },
      cache: "no-store",
    })
    .then(({ cart }) => cart)
    .catch(() => null)

  const paymentSession = cart?.payment_collection?.payment_sessions?.find(
    (session) => session.data?.id === paymentIntent
  )

  if (
    !paymentSession ||
    paymentSession.data?.client_secret !== paymentIntentClientSecret
  ) {
    return rejected()
  }

  await setCartId(cartId)

  // The customer backed out or the bank declined. Stripe puts the PaymentIntent
  // back into `requires_payment_method`, so the Payment Element can mount
  // against it again — return to the checkout and let them retry.
  if (redirectStatus === "failed") {
    const params = new URLSearchParams()

    // Forward Stripe's own return parameters so the checkout page can tell how
    // the off-site authorization ended.
    for (const key of [
      "payment_intent",
      "payment_intent_client_secret",
      "redirect_status",
    ]) {
      const value = searchParams.get(key)

      if (value) {
        params.set(key, value)
      }
    }

    return NextResponse.redirect(`${origin}/${locale}/checkout?${params}`)
  }

  try {
    await placeOrder(cartId)
  } catch (error) {
    unstable_rethrow(error)

    return NextResponse.redirect(`${origin}/${locale}/cart?error=order_failed`)
  }

  // Only reached when the cart did not convert into an order.
  return NextResponse.redirect(`${origin}/${locale}/cart?error=order_failed`)
}
