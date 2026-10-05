"use client"

import { Link } from "@i18n/navigation"
import {
  hasUnfinishedRobokassaPayment,
  readRobokassaPaymentStarted,
  type PaymentReturnNotice,
} from "@lib/util/robokassa-return"
import type { HttpTypes } from "@medusajs/types"
import { Button } from "@medusajs/ui"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

/** The payment section's anchor (`checkout-payment-section`). */
export const CHECKOUT_PAYMENT_ANCHOR = "checkout-payment"

/**
 * U-02 (46df UX audit): the buyer is back from Robokassa without having paid,
 * usually through the browser's Back button, because Robokassa's error screen
 * offers no way back. The notice says so and takes them to the payment
 * section, where the same button pays again and the method list offers
 * another way. The mark it reads is written by the Robokassa payment button.
 *
 * `notice` is what Robokassa's own return said (t-2026-10-04-48, the checkout's
 * `?payment=`, written by `app/api/payment-return` and the waiting page), and it
 * takes the place of the guess: `failed` names the failure, `pending` says the
 * payment is being confirmed (not «failed»: the money may be on its way) and
 * offers to check again rather than to pay again. One notice, never two.
 */
export default function RobokassaRetryNotice({
  cart,
  notice = null,
}: {
  cart: HttpTypes.StoreCart
  notice?: PaymentReturnNotice | null
}) {
  const t = useTranslations("CheckoutPage")
  // Read after mount only: the mark lives in the browser, and the server
  // render must match the first client render.
  const [startedCartId, setStartedCartId] = useState<string | null>(null)

  useEffect(() => {
    setStartedCartId(readRobokassaPaymentStarted())
    // Back from Robokassa can restore this page from the back/forward cache
    // without running a single effect again.
    const onPageShow = () => setStartedCartId(readRobokassaPaymentStarted())
    window.addEventListener("pageshow", onPageShow)
    return () => window.removeEventListener("pageshow", onPageShow)
  }, [])

  if (notice === "pending") {
    return (
      <div
        role="status"
        className="flex flex-col gap-y-3 rounded-md border border-status-warning-border bg-status-warning-bg p-4 small:flex-row small:items-center small:justify-between small:gap-x-6"
        data-testid="payment-pending-notice"
      >
        <div className="flex items-start gap-x-2">
          <span
            className="mt-[7px] h-2 w-2 flex-shrink-0 rounded-full bg-status-warning-text"
            aria-hidden
          />
          <div className="flex flex-col gap-y-0.5">
            <span className="txt-compact-medium-plus text-ui-fg-base">
              {t("paymentPendingHeading")}
            </span>
            <span className="txt-compact-small text-status-warning-text">
              {t("paymentPendingText")}
            </span>
          </div>
        </div>
        <Button
          asChild
          variant="secondary"
          className="w-full small:w-auto small:flex-shrink-0"
        >
          <Link href="/payment-return" data-testid="payment-pending-notice-action">
            {t("paymentPendingAction")}
          </Link>
        </Button>
      </div>
    )
  }

  const failed = notice === "failed"

  if (!failed && !hasUnfinishedRobokassaPayment(cart, startedCartId)) {
    return null
  }

  return (
    <div
      role="status"
      className="flex flex-col gap-y-3 rounded-md border border-status-error-border bg-status-error-bg p-4 small:flex-row small:items-center small:justify-between small:gap-x-6"
      data-testid="robokassa-retry-notice"
      data-value={failed ? "failed" : "interrupted"}
    >
      <div className="flex items-start gap-x-2">
        <span
          className="mt-[7px] h-2 w-2 flex-shrink-0 rounded-full bg-status-error"
          aria-hidden
        />
        <div className="flex flex-col gap-y-0.5">
          <span className="txt-compact-medium-plus text-ui-fg-error">
            {t(failed ? "paymentFailedHeading" : "paymentInterruptedHeading")}
          </span>
          <span className="txt-compact-small text-status-error-text">
            {t(failed ? "paymentFailedText" : "paymentInterruptedText")}
          </span>
        </div>
      </div>
      <Button
        variant="secondary"
        className="w-full small:w-auto small:flex-shrink-0"
        onClick={() =>
          document
            .getElementById(CHECKOUT_PAYMENT_ANCHOR)
            ?.scrollIntoView({ behavior: "smooth", block: "start" })
        }
        data-testid="robokassa-retry-notice-action"
      >
        {t("paymentInterruptedAction")}
      </Button>
    </div>
  )
}
