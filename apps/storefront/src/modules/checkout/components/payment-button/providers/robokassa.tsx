"use client"

import { useTranslations } from "next-intl"
import { useState } from "react"
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

  const session = cart.payment_collection?.payment_sessions?.find(
    (candidate) => candidate.provider_id === "pp_robokassa_robokassa"
  )
  const paymentUrl =
    typeof session?.data?.payment_url === "string"
      ? session.data.payment_url
      : null

  const handlePayment = () => {
    if (!paymentUrl) {
      setErrorMessage(t("redirectUnavailable"))
      return
    }
    setSubmitting(true)
    window.location.assign(paymentUrl)
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
