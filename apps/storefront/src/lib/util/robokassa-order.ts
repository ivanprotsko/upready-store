import type { HttpTypes } from "@medusajs/types"

/**
 * Where a Robokassa order's payment stands, for the buyer (t-2026-10-12-13).
 *
 * Since the buyer's return completes the cart (`app/api/payment-return`), an
 * order paid through Robokassa reaches its page in one of two states:
 * - `paid`: a Robokassa payment exists, authorized when the return proved it
 *   (its password #1 signature, or `OpStateExt`), captured once the Result
 *   webhook arrived. Either way Robokassa took the money: the buyer reads that
 *   the payment went through (Ivan 12.10: «обычно сразу сообщают что оплата
 *   прошла успешно»).
 * - `confirming`: the order was placed without a payment
 *   (`pending_authorization`), the buyer came back from Robokassa's success
 *   and its confirmation has not arrived yet; the page refreshes itself.
 * `null` for every other order, which keeps the page it had.
 *
 * The prefix `isRobokassa` in `lib/constants.tsx` tests; that file pulls in
 * JSX this module has no use for.
 */
export type RobokassaOrderPayment = "paid" | "confirming" | null

type SessionLike = { provider_id?: string | null; status?: string | null }
type PaymentLike = { provider_id?: string | null; canceled_at?: unknown }

export type RobokassaPaymentOrder = {
  payment_collections?: Array<
    | (Pick<HttpTypes.StorePaymentCollection, "id"> & {
        payments?: PaymentLike[] | null
        payment_sessions?: SessionLike[] | null
      })
    | null
  > | null
}

const isRobokassaProvider = (providerId: string | null | undefined) =>
  Boolean(providerId?.startsWith("pp_robokassa_"))

export const robokassaOrderPayment = (
  order: RobokassaPaymentOrder
): RobokassaOrderPayment => {
  const collections = (order.payment_collections ?? []).filter(
    (collection): collection is NonNullable<typeof collection> => Boolean(collection)
  )
  const payments = collections.flatMap((collection) => collection.payments ?? [])
  if (payments.some((payment) => isRobokassaProvider(payment?.provider_id) && !payment?.canceled_at)) {
    return "paid"
  }
  if (payments.length) {
    return null
  }
  const sessions = collections.flatMap((collection) => collection.payment_sessions ?? [])
  return sessions.some(
    (session) =>
      isRobokassaProvider(session?.provider_id) && session?.status === "pending_authorization"
  )
    ? "confirming"
    : null
}

/** How often the page asks again while Robokassa's confirmation is on its way, and for how long. */
export const ROBOKASSA_CONFIRMING_FAST_MS = 3_000
export const ROBOKASSA_CONFIRMING_FAST_FOR_MS = 2 * 60_000
export const ROBOKASSA_CONFIRMING_SLOW_MS = 15_000
export const ROBOKASSA_CONFIRMING_STOP_AFTER_MS = 15 * 60_000

/** The pause before the next refresh, `null` once the page stops asking. */
export const nextConfirmingRefreshMs = (elapsedMs: number): number | null => {
  if (elapsedMs >= ROBOKASSA_CONFIRMING_STOP_AFTER_MS) {
    return null
  }
  return elapsedMs < ROBOKASSA_CONFIRMING_FAST_FOR_MS
    ? ROBOKASSA_CONFIRMING_FAST_MS
    : ROBOKASSA_CONFIRMING_SLOW_MS
}
