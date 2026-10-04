"use client"

import { useErrorMessage } from "@lib/util/use-error-message"
import { Button } from "@medusajs/ui"
import { useTranslations } from "next-intl"

/**
 * The payment block's own failure line (t-2026-10-04-44). The payment session
 * the block creates on its own could not be made, most often because the proxy
 * in front of the Store API answered 502 for a moment. The line names that in
 * the shop's language and offers to try again. The rest of the checkout stays as
 * it is, and nothing tells the buyer «Что-то пошло не так».
 */
export default function PaymentSessionError({
  error,
  retrying,
  onRetry,
}: {
  error: string | null
  retrying: boolean
  onRetry: () => void
}) {
  const t = useTranslations("CheckoutPage")
  const getErrorMessage = useErrorMessage()

  if (!error) {
    return null
  }

  return (
    <div
      role="alert"
      className="flex flex-col gap-y-3 small:flex-row small:items-center small:justify-between small:gap-x-6"
      data-testid="payment-session-error"
    >
      <span className="txt-compact-small text-ui-fg-error">
        {getErrorMessage(error)}
      </span>
      <Button
        variant="secondary"
        size="small"
        className="w-full small:w-auto small:flex-shrink-0"
        isLoading={retrying}
        onClick={onRetry}
        data-testid="payment-session-retry"
      >
        {t("retryPaymentSetup")}
      </Button>
    </div>
  )
}
