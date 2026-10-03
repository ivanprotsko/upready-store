"use client"

import {
  hasUnfinishedRobokassaPayment,
  readRobokassaPaymentStarted,
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
 */
export default function RobokassaRetryNotice({
  cart,
}: {
  cart: HttpTypes.StoreCart
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

  if (!hasUnfinishedRobokassaPayment(cart, startedCartId)) {
    return null
  }

  return (
    <div
      role="status"
      className="flex flex-col gap-y-3 rounded-md border border-ui-tag-red-border bg-ui-tag-red-bg p-4 small:flex-row small:items-center small:justify-between small:gap-x-6"
      data-testid="robokassa-retry-notice"
    >
      <div className="flex items-start gap-x-2">
        <span
          className="mt-[7px] h-2 w-2 flex-shrink-0 rounded-full bg-ui-tag-red-icon"
          aria-hidden
        />
        <div className="flex flex-col gap-y-0.5">
          <span className="txt-compact-medium-plus text-ui-fg-error">
            {t("paymentInterruptedHeading")}
          </span>
          <span className="txt-compact-small text-ui-tag-red-text">
            {t("paymentInterruptedText")}
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
