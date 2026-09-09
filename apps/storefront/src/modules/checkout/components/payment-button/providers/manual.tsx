"use client"

import {
  classifyDemoCard,
  EMPTY_DEMO_CARD,
} from "@modules/checkout/components/demo-card-fields"
import { useLocale, useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import {
  PaymentButtonShell,
  type PaymentProviderButtonProps,
  usePlaceOrder,
} from "../shared"

/**
 * The only live payment provider on every stand today (§3.1 of the checkout
 * map). Its demo card gates the button the way a real gateway would: a number
 * ending `0000` declines inline and keeps the form filled for a retry, a
 * number ending `9999` behaves like a payment that cleared but whose order
 * never completed — `order-error-banner` reads the same `?error=order_failed`
 * target `app/api/payment-return/route.ts` already uses for that exact cause
 * (its `placeOrder` `catch` and its own "cart did not convert" branch both
 * redirect there, never to `payment_failed`, which that route reserves for a
 * rejection BEFORE an order is attempted). Any other number that passes Luhn
 * places the order for real, through the same `completeOrder()` every
 * provider shares.
 */
const ManualPaymentButton = ({
  notReady,
  label,
  cartUpdating,
  demoCard,
  "data-testid": dataTestId,
}: PaymentProviderButtonProps) => {
  const t = useTranslations("DemoCard")
  const locale = useLocale()
  const router = useRouter()
  const { submitting, setSubmitting, errorMessage, setErrorMessage, completeOrder } =
    usePlaceOrder()

  const handlePayment = () => {
    setSubmitting(true)

    const outcome = classifyDemoCard(demoCard ?? EMPTY_DEMO_CARD)

    if (outcome === "decline") {
      setErrorMessage(t("declined"))
      setSubmitting(false)
      return
    }

    if (outcome === "redirect") {
      router.push(`/${locale}/cart?error=order_failed`)
      return
    }

    completeOrder()
  }

  return (
    <PaymentButtonShell
      label={label}
      onClick={handlePayment}
      disabled={notReady}
      loading={submitting || cartUpdating}
      errorMessage={errorMessage}
      errorTestId="manual-payment-error-message"
      data-testid={dataTestId ?? "submit-order-button"}
    />
  )
}

export default ManualPaymentButton
