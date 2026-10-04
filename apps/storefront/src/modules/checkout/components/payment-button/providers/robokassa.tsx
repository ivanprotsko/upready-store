"use client"

import type { HttpTypes } from "@medusajs/types"
import { useEffect, useRef, useState } from "react"
import { retrieveCart } from "@lib/data/cart"
import { markRobokassaPaymentStarted } from "@lib/util/robokassa-return"
import { loadRobokassaIframe } from "@lib/util/robokassa-iframe"
import {
  isRobokassaFailReturn,
  ROBOKASSA_ORIGIN,
  robokassaPaymentRequest,
} from "@lib/util/robokassa-methods"
import { PaymentButtonShell, type PaymentProviderButtonProps } from "../shared"

/**
 * Robokassa (t03-tenant-secrets-robokassa): the backend built a signed payment
 * request into the session when the method was selected. Nothing is placed
 * here. Robokassa calls the backend's Result URL when the customer has paid,
 * that call completes the cart into an order, and the customer comes back
 * through `app/api/payment-return`, which only reads that order.
 *
 * Since t-2026-10-04-49 the payment opens in Robokassa's own modal over the
 * checkout, straight on the method the buyer picked in the list
 * (`robokassaMethod`), so the buyer never leaves the shop's page: closing the
 * modal or a failed payment leaves them on the same filled checkout, and a
 * successful one goes on to the return route. The full-page redirect, with
 * the method preselected, stays as the fallback for a session built before
 * the modal and for a script that does not load.
 */
const RobokassaPaymentButton = ({
  cart,
  notReady,
  label,
  cartUpdating,
  robokassaMethod = null,
  "data-testid": dataTestId,
}: PaymentProviderButtonProps) => {
  const [submitting, setSubmitting] = useState(false)
  // An `Errors` key: `ErrorMessage` prints only those, in the shop's locale.
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // Detaches the `FailUrl2` interceptor of the modal that is open, if any.
  const detachRef = useRef<(() => void) | null>(null)

  // U-02 (46df): Back from Robokassa can restore this page from the
  // back/forward cache with the button still spinning from the click that
  // left it.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setSubmitting(false)
    }
    window.addEventListener("pageshow", onPageShow)
    return () => window.removeEventListener("pageshow", onPageShow)
  }, [])

  // The script loads while the buyer finishes the form, so the click opens
  // the modal at once. A failure here is retried by the click itself.
  useEffect(() => {
    loadRobokassaIframe().catch(() => undefined)
    return () => detachRef.current?.()
  }, [])

  const sessionOf = (candidate: HttpTypes.StoreCart | null) =>
    candidate?.payment_collection?.payment_sessions?.find(
      (item) => item.provider_id === "pp_robokassa_robokassa"
    ) ?? null

  // Enough to enable the button; never the request that is actually opened.
  const paymentUrl =
    typeof sessionOf(cart)?.data?.payment_url === "string"
      ? (sessionOf(cart)?.data?.payment_url as string)
      : null

  /**
   * The request is read again, from the server, at the moment of the click.
   *
   * Creating a payment session REPLACES the collection's session with a new id
   * (`POST /store/payment-collections/:id/payment-sessions`), and the checkout
   * re-creates it whenever the receipt context changes — a late address, a
   * promotion, a shipping method picked after the payment method. The props of
   * this button are one render behind that, and a stale request is not a
   * cosmetic problem: its `InvId` and `Shp_SessionID` name a session the
   * server has deleted, so Robokassa takes the money and its Result webhook
   * answers `unknown_session` — the customer pays and no order is ever created
   * (measured on the stand 2026-09-16).
   */
  const handlePayment = async () => {
    if (!paymentUrl) {
      setErrorMessage("paymentNotReady")
      return
    }
    setSubmitting(true)
    setErrorMessage(null)
    const fresh = await retrieveCart(
      cart.id,
      "id,payment_collection.payment_sessions.provider_id,payment_collection.payment_sessions.data"
    ).catch(() => null)
    const request = robokassaPaymentRequest(sessionOf(fresh)?.data, robokassaMethod)
    if (!request.modalParams && !request.redirectUrl) {
      // Better a customer who can press again than one who pays into a session
      // that no longer exists.
      setSubmitting(false)
      setErrorMessage("paymentNotReady")
      return
    }
    // Lets the checkout tell a buyer who comes back unpaid what happened
    // (`robokassa-retry-notice`).
    markRobokassaPaymentStarted(cart.id)

    const redirect = () => {
      if (request.redirectUrl) {
        window.location.assign(request.redirectUrl)
        return
      }
      setSubmitting(false)
      setErrorMessage("paymentNotReady")
    }

    if (!request.modalParams) {
      redirect()
      return
    }

    const robokassa = await loadRobokassaIframe().catch(() => null)
    if (!robokassa) {
      redirect()
      return
    }

    const finish = (status: string) => {
      detachRef.current?.()
      detachRef.current = null
      if (status === "success" && request.successUrl) {
        // Paid: the return route waits for the Result webhook and opens the order.
        window.location.assign(request.successUrl)
        return
      }
      setSubmitting(false)
      if (status === "fail") {
        setErrorMessage("paymentFailed")
      }
    }

    // Robokassa may ask the page itself to open the session's `FailUrl2`
    // (its `redirect` action), which would take the buyer off the checkout
    // they filled in. Caught in the capture phase, ahead of the script's own
    // listener, and turned into the same in-place message a `fail` gets.
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== ROBOKASSA_ORIGIN) return
      const data = event.data as { action?: unknown; url?: unknown } | null
      if (
        data &&
        typeof data === "object" &&
        data.action === "redirect" &&
        isRobokassaFailReturn(data.url, request.failUrl)
      ) {
        event.stopImmediatePropagation()
        robokassa.ClosePaymentForm()
        finish("fail")
      }
    }
    detachRef.current?.()
    window.addEventListener("message", onMessage, true)
    detachRef.current = () => window.removeEventListener("message", onMessage, true)

    robokassa.Render(request.modalParams, null, {
      onComplete: (result) => finish(result.status),
    })
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
