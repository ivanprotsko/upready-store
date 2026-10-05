"use client"

import { useEffect, useState } from "react"
import { initiatePaymentSessionOrReason, retrieveCart } from "@lib/data/cart"
import { buildPaymentSessionData } from "@lib/constants"
import {
  BTCPAY_PROVIDER_ID,
  btcpayCheckoutLink,
  btcpayInvoiceIsOver,
  btcpaySessionOf,
} from "@lib/util/btcpay"
import { PaymentButtonShell, type PaymentProviderButtonProps } from "../shared"

const SESSION_FIELDS =
  "id,payment_collection.payment_sessions.provider_id,payment_collection.payment_sessions.status,payment_collection.payment_sessions.data"

/**
 * BTCPay Server (ask-20261005-070255-438f): the backend created an invoice on
 * the shop's own BTCPay store when the method was selected, and this button
 * sends the buyer to its checkout page. Nothing is placed here. The order is
 * created once the backend reads the invoice as Settled from that server
 * (webhook, sweep job, or the waiting page's own completion), and BTCPay's
 * «return to store» brings the buyer to `app/api/payment-return`.
 *
 * The session is read again at the click, for the reason the Robokassa button
 * gives: the checkout replaces sessions behind this component's back. An
 * invoice that expired or went invalid in the meantime is not reopened; the
 * button asks for a new session, which is a new invoice at the current rate.
 */
const BtcpayPaymentButton = ({
  cart,
  notReady,
  label,
  cartUpdating,
  "data-testid": dataTestId,
}: PaymentProviderButtonProps) => {
  const [submitting, setSubmitting] = useState(false)
  // An `Errors` key: `ErrorMessage` prints only those, in the shop's locale.
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Back from BTCPay can restore this page from the back/forward cache with
  // the button still spinning from the click that left it.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setSubmitting(false)
    }
    window.addEventListener("pageshow", onPageShow)
    return () => window.removeEventListener("pageshow", onPageShow)
  }, [])

  const ready = Boolean(btcpayCheckoutLink(btcpaySessionOf(cart)))

  const handlePayment = async () => {
    setSubmitting(true)
    setErrorMessage(null)

    let session = btcpaySessionOf(await retrieveCart(cart.id, SESSION_FIELDS).catch(() => null))

    if (!session || btcpayInvoiceIsOver(session)) {
      const refused = await initiatePaymentSessionOrReason(cart, {
        provider_id: BTCPAY_PROVIDER_ID,
        data: buildPaymentSessionData(BTCPAY_PROVIDER_ID, cart),
      }).catch(() => ({ error: "paymentNotReady" as const }))
      if (refused) {
        setSubmitting(false)
        setErrorMessage(refused.error)
        return
      }
      session = btcpaySessionOf(await retrieveCart(cart.id, SESSION_FIELDS).catch(() => null))
    }

    const link = btcpayCheckoutLink(session)
    if (!link || btcpayInvoiceIsOver(session)) {
      setSubmitting(false)
      setErrorMessage("paymentNotReady")
      return
    }
    window.location.assign(link)
  }

  return (
    <PaymentButtonShell
      label={label}
      onClick={handlePayment}
      disabled={notReady || !ready}
      loading={submitting || cartUpdating}
      errorMessage={errorMessage}
      errorTestId="btcpay-payment-error-message"
      data-testid={dataTestId ?? "submit-order-button"}
    />
  )
}

export default BtcpayPaymentButton
