"use client"

import type { HttpTypes } from "@medusajs/types"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { retrieveCart } from "@lib/data/cart"
import { PaymentButtonShell, type PaymentProviderButtonProps } from "../shared"

/**
 * Robokassa is a redirect provider (t03-tenant-secrets-robokassa): the backend
 * built a signed payment URL into the session when the method was selected,
 * and paying means leaving for it. Nothing is placed here. Robokassa calls the
 * backend's Result URL when the customer has paid, that call completes the
 * cart into an order, and the customer comes back through
 * `app/api/payment-return`, which only reads that order.
 */
const RobokassaPaymentButton = ({
  cart,
  notReady,
  label,
  cartUpdating,
  "data-testid": dataTestId,
}: PaymentProviderButtonProps) => {
  const t = useTranslations("PaymentButton")
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const sessionUrlOf = (candidate: HttpTypes.StoreCart | null) => {
    const session = candidate?.payment_collection?.payment_sessions?.find(
      (item) => item.provider_id === "pp_robokassa_robokassa"
    )
    return typeof session?.data?.payment_url === "string"
      ? session.data.payment_url
      : null
  }

  // Enough to enable the button; never the URL that is actually opened.
  const paymentUrl = sessionUrlOf(cart)

  /**
   * The URL is read again, from the server, at the moment of the click.
   *
   * Creating a payment session REPLACES the collection's session with a new id
   * (`POST /store/payment-collections/:id/payment-sessions`), and the checkout
   * re-creates it whenever the receipt context changes — a late address, a
   * promotion, a shipping method picked after the payment method. The props of
   * this button are one render behind that, and for a redirect provider a stale
   * URL is not a cosmetic problem: its `InvId` and `Shp_SessionID` name a
   * session the server has deleted, so Robokassa takes the money and its Result
   * webhook answers `unknown_session` — the customer pays and no order is ever
   * created (measured on the stand 2026-09-16).
   */
  const handlePayment = async () => {
    if (!paymentUrl) {
      setErrorMessage(t("redirectUnavailable"))
      return
    }
    setSubmitting(true)
    setErrorMessage(null)
    const fresh = await retrieveCart(
      cart.id,
      "id,payment_collection.payment_sessions.provider_id,payment_collection.payment_sessions.data"
    ).catch(() => null)
    const current = sessionUrlOf(fresh)
    if (!current) {
      // Better a customer who can press again than one who pays into a session
      // that no longer exists.
      setSubmitting(false)
      setErrorMessage(t("redirectUnavailable"))
      return
    }
    window.location.assign(current)
  }

  return (
    <PaymentButtonShell
      label={label}
      onClick={handlePayment}
      disabled={notReady || !paymentUrl}
      loading={submitting || cartUpdating}
      errorMessage={errorMessage}
      errorTestId="robokassa-payment-error-message"
      data-testid={dataTestId ?? "submit-order-button"}
    />
  )
}

export default RobokassaPaymentButton
