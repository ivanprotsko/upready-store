import type { HttpTypes } from "@medusajs/types"

/**
 * U-02 (46df UX audit): Robokassa's own error screen has no way back to the
 * shop, so a buyer whose payment failed returns with the browser's Back button
 * to a checkout that used to say nothing. The session's `data` records nothing
 * about the buyer having left for payment, and the provider is not ours to
 * change here, so the payment button leaves this mark in the browser the
 * moment it sends the buyer to Robokassa. It holds only the cart id.
 */
const STORAGE_KEY = "robokassa-payment-started"

export const markRobokassaPaymentStarted = (cartId: string) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, cartId)
  } catch {
    // Storage blocked (private mode, quota): the notice is a hint, not a gate.
  }
}

export const readRobokassaPaymentStarted = (): string | null => {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/**
 * True while the cart the buyer left for Robokassa from is still open and
 * still carries an unpaid Robokassa session. A cart that became an order, a
 * session Robokassa confirmed, or a buyer who switched to another method all
 * end the notice without any cleanup.
 */
export const hasUnfinishedRobokassaPayment = (
  cart: HttpTypes.StoreCart,
  startedCartId: string | null
): boolean => {
  if (!startedCartId || startedCartId !== cart.id || cart.completed_at) {
    return false
  }
  return (cart.payment_collection?.payment_sessions ?? []).some(
    (session) =>
      // The prefix `isRobokassa` in `lib/constants.tsx` tests; that file pulls
      // in JSX this module has no use for.
      session.provider_id?.startsWith("pp_robokassa_") &&
      session.status !== "captured" &&
      session.status !== "authorized"
  )
}
