"use client"

import { useEffect, useState } from "react"
import { initiatePaymentSessionOrReason, retrieveCart } from "@lib/data/cart"
import { buildPaymentSessionData } from "@lib/constants"
import {
  BITCART_PROVIDER_ID,
  bitcartCheckoutLink,
  bitcartInvoiceIsOver,
  bitcartSessionOf,
} from "@lib/util/bitcart"
import { PaymentButtonShell, type PaymentProviderButtonProps } from "../shared"

const SESSION_FIELDS =
  "id,payment_collection.payment_sessions.provider_id,payment_collection.payment_sessions.status,payment_collection.payment_sessions.data"

/**
 * Bitcart (ask-20261005-070255-438f, stage 2), the same flow as the BTCPay
 * button: the backend created an invoice on the shop's own Bitcart store when
 * the method was selected, and this button sends the buyer to its checkout
 * page on the shop's Bitcart admin app. Nothing is placed here. The order is
 * created once the backend reads the invoice as complete from that server
 * (sweep job, notification, or the waiting page's own completion), and
 * Bitcart's «return to store» brings the buyer to `app/api/payment-return`.
 *
 * The session is read again at the click, for the reason the Robokassa button
 * gives: the checkout replaces sessions behind this component's back. An
 * invoice that expired or went invalid in the meantime is not reopened; the
 * button asks for a new session, which is a new invoice at the current rate.
 */
const BitcartPaymentButton = ({
  cart,
  notReady,
  label,
  cartUpdating,
  "data-testid": dataTestId,
}: PaymentProviderButtonProps) => {
  const [submitting, setSubmitting] = useState(false)
  // An `Errors` key: `ErrorMessage` prints only those, in the shop's locale.
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Back from Bitcart can restore this page from the back/forward cache with
  // the button still spinning from the click that left it.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setSubmitting(false)
    }
    window.addEventListener("pageshow", onPageShow)
    return () => window.removeEventListener("pageshow", onPageShow)
  }, [])

  const ready = Boolean(bitcartCheckoutLink(bitcartSessionOf(cart)))

  const handlePayment = async () => {
    setSubmitting(true)
    setErrorMessage(null)

    let session = bitcartSessionOf(await retrieveCart(cart.id, SESSION_FIELDS).catch(() => null))

    if (!session || bitcartInvoiceIsOver(session)) {
      const refused = await initiatePaymentSessionOrReason(cart, {
        provider_id: BITCART_PROVIDER_ID,
        data: buildPaymentSessionData(BITCART_PROVIDER_ID, cart),
      }).catch(() => ({ error: "paymentNotReady" as const }))
      if (refused) {
        setSubmitting(false)
        setErrorMessage(refused.error)
        return
      }
      session = bitcartSessionOf(await retrieveCart(cart.id, SESSION_FIELDS).catch(() => null))
    }

    const link = bitcartCheckoutLink(session)
    if (!link || bitcartInvoiceIsOver(session)) {
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
      errorTestId="bitcart-payment-error-message"
      data-testid={dataTestId ?? "submit-order-button"}
    />
  )
}

export default BitcartPaymentButton
