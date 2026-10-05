import type { HttpTypes } from "@medusajs/types"

/**
 * The storefront's half of the BTCPay Server provider
 * (ask-20261005-070255-438f), kept free of JSX so vitest can import it
 * (`pick-payment-method.ts` explains why that matters here).
 *
 * The backend creates the invoice when the payment method is chosen and keeps
 * its checkout page on the session (`data.checkout_link`). The pay button sends
 * the buyer there; BTCPay sends them back to `app/api/payment-return`, which
 * proves nothing and only leads to the waiting page. The order exists once the
 * backend has read a Settled invoice from the shop's own server.
 */

export const BTCPAY_PROVIDER_ID = "pp_btcpay_btcpay"

export const isBtcpay = (providerId?: string | null) =>
  Boolean(providerId?.startsWith("pp_btcpay_"))

/**
 * Where BTCPay's «return to store» button leads. Built in the browser, because
 * the shop's public origin is the one the buyer is on, the way
 * `robokassaReturnUrl` in `lib/constants.tsx` builds its own.
 */
export const btcpayReturnUrl = (
  cartId: string,
  { origin, locale }: { origin: string; locale: string }
) => {
  const params = new URLSearchParams({ provider: "btcpay", cart_id: cartId })
  if (locale) {
    params.set("locale", locale)
  }
  return `${origin}/api/payment-return?${params.toString()}`
}

type SessionLike = {
  provider_id?: string | null
  status?: string | null
  data?: Record<string, unknown> | null
}

export const btcpaySessionOf = (
  cart: { payment_collection?: { payment_sessions?: SessionLike[] | null } | null } | null | undefined
): SessionLike | null =>
  cart?.payment_collection?.payment_sessions?.find((session) =>
    isBtcpay(session.provider_id)
  ) ?? null

/** The invoice's checkout page, only if it is an http(s) address. */
export const btcpayCheckoutLink = (session: SessionLike | null): string | null => {
  const link = session?.data?.checkout_link
  if (typeof link !== "string") {
    return null
  }
  try {
    const url = new URL(link)
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null
  } catch {
    return null
  }
}

/**
 * Whether the session's invoice can no longer be paid: BTCPay reported it
 * expired or invalid, or its expiry time has passed. The pay button then asks
 * for a new session, which is a new invoice at the current rate, instead of
 * sending the buyer to a dead checkout page.
 */
export const btcpayInvoiceIsOver = (session: SessionLike | null, now = Date.now()) => {
  if (!session) {
    return false
  }
  if (session.status === "canceled" || session.status === "error") {
    return true
  }
  const status = session.data?.invoice_status
  if (status === "Expired" || status === "Invalid") {
    return true
  }
  const expiresAt = session.data?.expires_at
  return typeof expiresAt === "string" && Date.parse(expiresAt) <= now
}

/**
 * What the checkout tells a buyer back from BTCPay whose order is not there
 * yet: the network has not confirmed the transfer (`pending`), or the invoice
 * expired with nothing paid (`expired`). An invoice that expired after a
 * partial or a late payment stays `pending`: the shop decides about that
 * money, and the buyer must not be told to pay again. `null` when the cart
 * holds no BTCPay session.
 */
export const btcpayReturnState = (
  cart: HttpTypes.StoreCart | null | undefined
): "pending" | "expired" | null => {
  const session = btcpaySessionOf(cart)
  if (!session) {
    return null
  }
  const additional = session.data?.additional_status
  const somethingPaid = additional === "PaidLate" || additional === "PaidPartial"
  return btcpayInvoiceIsOver(session) && !somethingPaid ? "expired" : "pending"
}
