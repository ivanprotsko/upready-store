import { sdk } from "@lib/config"
import { completeCartAfterReturn, placeOrder } from "@lib/data/cart"
import { confirmRobokassaReturn } from "@lib/data/payment"
import { getAuthHeaders, setCartId } from "@lib/data/cookies"
import { isAppLocale, defaultLocale } from "@i18n/config"
import type { HttpTypes } from "@medusajs/types"
import { unstable_rethrow } from "next/navigation"
import { type NextRequest, NextResponse } from "next/server"

/**
 * Robokassa's return (t03-tenant-secrets-robokassa). Robokassa redirects the
 * browser to `SuccessUrl2`/`FailUrl2` (this route, `provider=robokassa`) and,
 * in parallel, posts the Result webhook to the backend. It puts the cart back
 * into the cookie, then
 *   - a failed payment goes straight back to the checkout, every field and
 *     box as the buyer left them, with a notice (`?payment=failed`);
 *   - a success goes straight to the order page (t-2026-10-12-13, Ivan 12.10:
 *     «если заказ прошел успешно, то нужно перенаправлять на страницу
 *     успешного заказа а не корзину», and 1.3: no screen of ours in between).
 *     The backend checks once what the return proves (its password #1
 *     signature, or `OpStateExt` for a live invoice) and the cart is completed
 *     here, server-side: into an order with the payment authorized when it was
 *     proved, into an order awaiting Robokassa's confirmation when it was not.
 *     Robokassa saying this invoice was never paid sends the buyer back to the
 *     checkout with the failure notice.
 * Only when the backend cannot be asked at all does the buyer reach the
 * waiting page (`[locale]/payment-return`), which keeps asking for the order.
 * Tribute, BTCPay and Bitcart keep that waiting page as their success return.
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

  if (searchParams.get("provider") === "robokassa") {
    // Robokassa's own parameters on a full-page return; the modal's success
    // brings none of them (measured on the test shop 12.10.2026).
    const params = {
      OutSum: searchParams.get("OutSum") ?? undefined,
      InvId: searchParams.get("InvId") ?? undefined,
      SignatureValue: searchParams.get("SignatureValue") ?? undefined,
      Shp_SessionID: searchParams.get("Shp_SessionID") ?? undefined,
    }
    const check = await confirmRobokassaReturn(cartId, params).catch((error) => {
      console.error(`[payment-return] robokassa return of cart ${cartId} was not checked:`, error)
      return null
    })
    if (check?.status === "not_paid") {
      return paymentFailed()
    }
    if (check && check.status !== "no_session") {
      const confirmedPath = await completeCartAfterReturn(cartId)
      if (confirmedPath) {
        // The path carries the locale `getLocale` found; the buyer's is the one they paid in.
        return NextResponse.redirect(
          `${origin}${confirmedPath.replace(/^\/[^/]+\//, `/${locale}/`)}`
        )
      }
    }
  }

  return NextResponse.redirect(`${origin}/${locale}/payment-return`)
}

export async function GET(req: NextRequest) {
  // BTCPay Server's and Bitcart's «return to store» (ask-20261005-070255-438f)
  // take the same path as Robokassa's success: the backend reads the invoice
  // from the shop's own server, and the waiting page looks for the order it
  // made. Neither sends an `outcome`, so this never reads as a failure.
  // Tribute's success and fail addresses (t-cherk-22) carry an `outcome` the
  // way Robokassa's do, and its final `shop_order` webhook makes the order.
  const provider = req.nextUrl.searchParams.get("provider")
  if (
    provider === "robokassa" ||
    provider === "tribute" ||
    provider === "btcpay" ||
    provider === "bitcart"
  ) {
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
