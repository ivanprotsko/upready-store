"use client"

import { useEffect, useState } from "react"
import { useRouter } from "@i18n/navigation"
import { retrieveCart } from "@lib/data/cart"
import {
  openTributePayment,
  telegramLinkOpener,
  tributePaymentTarget,
  tributeSessionOf,
} from "@lib/util/tribute"
import { PaymentButtonShell, type PaymentProviderButtonProps } from "../shared"

const SESSION_FIELDS =
  "id,payment_collection.payment_sessions.provider_id,payment_collection.payment_sessions.data"

/**
 * Tribute (t-cherk-22): the backend created the order at Tribute when the
 * method was selected, and this button sends the buyer to its payment page.
 * Nothing is placed here. Tribute's final `shop_order` webhook completes the
 * cart into an order on the backend, and Tribute brings the buyer back through
 * `app/api/payment-return`, which only leads to the waiting page.
 *
 * Inside the Telegram Mini App the bridge opens Tribute's own Mini App
 * (`webapp_payment_url`) over this one, and this page goes on to the waiting
 * page, where a buyer who comes back finds the order or the checkout with the
 * «being confirmed» notice. A client without the bridge gets the browser page.
 *
 * The session is read again at the click, for the reason the Robokassa button
 * gives: the checkout replaces sessions behind this component's back, and each
 * new session is a new order at Tribute.
 */
const TributePaymentButton = ({
  cart,
  notReady,
  label,
  cartUpdating,
  "data-testid": dataTestId,
}: PaymentProviderButtonProps) => {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  // An `Errors` key: `ErrorMessage` prints only those, in the shop's locale.
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Back from Tribute can restore this page from the back/forward cache with
  // the button still spinning from the click that left it.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setSubmitting(false)
    }
    window.addEventListener("pageshow", onPageShow)
    return () => window.removeEventListener("pageshow", onPageShow)
  }, [])

  // Enough to enable the button; never the address that is actually opened.
  const ready = Boolean(
    tributePaymentTarget(tributeSessionOf(cart), { telegramLink: false })
  )

  const handlePayment = async () => {
    setSubmitting(true)
    setErrorMessage(null)

    const session = tributeSessionOf(
      await retrieveCart(cart.id, SESSION_FIELDS).catch(() => null)
    )
    const opened = openTributePayment(session, {
      openTelegramLink: telegramLinkOpener(),
      assign: (url) => window.location.assign(url),
    })

    if (opened === "telegram") {
      // Tribute's Mini App is over this one now. A buyer who comes back finds
      // the waiting page, the order, or the checkout saying «being confirmed».
      router.push("/payment-return")
      return
    }
    if (!opened) {
      // Better a buyer who can press again than one sent to a dead session.
      setSubmitting(false)
      setErrorMessage("paymentNotReady")
    }
  }

  return (
    <PaymentButtonShell
      label={label}
      onClick={handlePayment}
      disabled={notReady || !ready}
      loading={submitting || cartUpdating}
      errorMessage={errorMessage}
      errorTestId="tribute-payment-error-message"
      data-testid={dataTestId ?? "submit-order-button"}
    />
  )
}

export default TributePaymentButton
