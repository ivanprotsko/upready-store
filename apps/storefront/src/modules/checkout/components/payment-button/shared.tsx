"use client"

import { placeOrderOrReason } from "@lib/data/cart"
import type { HttpTypes } from "@medusajs/types"
import { Button } from "@medusajs/ui"
import ErrorMessage from "@modules/checkout/components/error-message"
import type { DemoCardValue } from "@modules/checkout/components/demo-card-fields"
import type { ManualPaymentKind } from "@lib/tenant/manual-payment"
import { unstable_rethrow } from "next/navigation"
import { type ReactNode, useCallback, useState } from "react"

/**
 * Props every button under `providers/` receives. They all take the same shape,
 * so the dispatcher in `index.tsx` hands one set of values to whichever button
 * the active payment provider selects. `demoCard` is read by `providers/
 * manual.tsx` alone — every other provider ignores it.
 */
export type PaymentProviderButtonProps = {
  cart: HttpTypes.StoreCart
  notReady: boolean
  label: ReactNode
  cartUpdating: boolean
  demoCard?: DemoCardValue
  /**
   * The offline kind the buyer chose inside the manual provider
   * (olavka-payments): crypto or «card via manager». Read by `providers/
   * manual.tsx` alone; null keeps the demo card flow.
   */
  manualKind?: ManualPaymentKind | null
  /**
   * The Robokassa method alias the buyer picked in the list (`BankCard`,
   * `SBP`…, t-2026-10-04-49). Read by `providers/robokassa.tsx` alone, which
   * opens Robokassa on it only when the session's own whitelist lists it.
   */
  robokassaMethod?: string | null
  "data-testid"?: string
}

/**
 * Order placement shared by every payment button. It holds the submitting flag
 * and the error message, and a provider button drives both from its own payment
 * flow.
 */
export const usePlaceOrder = () => {
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const completeOrder = useCallback(async () => {
    // A refusal the backend gave comes back as an `Errors` key, which
    // `ErrorMessage` prints in the shop's locale (t-2026-10-04-23).
    await placeOrderOrReason()
      .then((refused) => {
        if (refused) {
          setErrorMessage(refused.error)
          setSubmitting(false)
        }
      })
      .catch((err) => {
        // A successful `placeOrder` ends in `redirect()`, which reaches this
        // catch as a NEXT_REDIRECT control-flow error rather than a failure.
        // Swallowing it would paint "something went wrong" over a placed order.
        unstable_rethrow(err)

        setErrorMessage(err.message)
        setSubmitting(false)
      })
  }, [])

  return {
    submitting,
    setSubmitting,
    errorMessage,
    setErrorMessage,
    completeOrder,
  }
}

type PaymentButtonShellProps = {
  label: ReactNode
  onClick: () => void
  disabled: boolean
  loading: boolean
  errorMessage: string | null
  errorTestId: string
  "data-testid"?: string
}

/**
 * The markup every payment button shares. A provider button keeps its own
 * payment flow and renders the outcome through this.
 */
export const PaymentButtonShell = ({
  label,
  onClick,
  disabled,
  loading,
  errorMessage,
  errorTestId,
  "data-testid": dataTestId,
}: PaymentButtonShellProps) => {
  return (
    <>
      <Button
        disabled={disabled}
        onClick={onClick}
        size="large"
        isLoading={loading}
        className="w-full"
        data-testid={dataTestId}
      >
        {label}
      </Button>
      <ErrorMessage error={errorMessage} data-testid={errorTestId} />
    </>
  )
}
