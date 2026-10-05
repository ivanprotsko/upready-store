import type { HttpTypes } from "@medusajs/types"

/**
 * The storefront's half of the Bitcart provider (ask-20261005-070255-438f,
 * stage 2), the counterpart of `btcpay.ts`, kept free of JSX so vitest can
 * import it.
 *
 * The backend creates the invoice when the payment method is chosen and keeps
 * its checkout page, on the shop's Bitcart admin app, on the session
 * (`data.checkout_link`). The pay button sends the buyer there; Bitcart's
 * «return to store» brings them to `app/api/payment-return`, which proves
 * nothing and only leads to the waiting page. The order exists once the
 * backend has read a complete invoice from the shop's own server.
 */

export const BITCART_PROVIDER_ID = "pp_bitcart_bitcart"

export const isBitcart = (providerId?: string | null) =>
  Boolean(providerId?.startsWith("pp_bitcart_"))

/**
 * Where Bitcart's «return to store» leads. Built in the browser, because the
 * shop's public origin is the one the buyer is on, as `btcpayReturnUrl` does.
 */
export const bitcartReturnUrl = (
  cartId: string,
  { origin, locale }: { origin: string; locale: string }
) => {
  const params = new URLSearchParams({ provider: "bitcart", cart_id: cartId })
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

export const bitcartSessionOf = (
  cart: { payment_collection?: { payment_sessions?: SessionLike[] | null } | null } | null | undefined
): SessionLike | null =>
  cart?.payment_collection?.payment_sessions?.find((session) =>
    isBitcart(session.provider_id)
  ) ?? null

/** The invoice's checkout page, only if it is an http(s) address. */
export const bitcartCheckoutLink = (session: SessionLike | null): string | null => {
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

/** Bitcart statuses after which the invoice takes no payment any more. */
const OVER_STATUSES = new Set(["expired", "invalid", "refunded"])

/**
 * Whether the session's invoice can no longer be paid: Bitcart reported it
 * expired, invalid or refunded, or its expiry time has passed. The pay button
 * then asks for a new session, which is a new invoice at the current rate,
 * instead of sending the buyer to a dead checkout page.
 */
export const bitcartInvoiceIsOver = (session: SessionLike | null, now = Date.now()) => {
  if (!session) {
    return false
  }
  if (session.status === "canceled" || session.status === "error") {
    return true
  }
  const status = session.data?.invoice_status
  if (typeof status === "string" && OVER_STATUSES.has(status)) {
    return true
  }
  const expiresAt = session.data?.expires_at
  return typeof expiresAt === "string" && Date.parse(expiresAt) <= now
}

/**
 * What the checkout tells a buyer back from Bitcart whose order is not there
 * yet: the network has not confirmed the transfer (`pending`), or the invoice
 * expired with nothing paid (`expired`). An invoice that expired after a
 * partial payment stays `pending`: the shop decides about that money, and the
 * buyer must not be told to pay again. `null` when the cart holds no Bitcart
 * session.
 */
export const bitcartReturnState = (
  cart: HttpTypes.StoreCart | null | undefined
): "pending" | "expired" | null => {
  const session = bitcartSessionOf(cart)
  if (!session) {
    return null
  }
  const somethingPaid = session.data?.exception_status === "paid_partial"
  return bitcartInvoiceIsOver(session) && !somethingPaid ? "expired" : "pending"
}
