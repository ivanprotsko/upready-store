"use client"

import { useState } from "react"
import { initiatePaymentSessionOrReason, retrieveCart } from "@lib/data/cart"
import {
  X402_PROVIDER_ID,
  isTestNetwork,
  payWithWallet,
  pickRequirement,
  x402SessionOf,
  type Eip1193Provider,
} from "@lib/util/x402"
import { Text } from "@medusajs/ui"
import { useTranslations } from "next-intl"
import {
  PaymentButtonShell,
  usePlaceOrder,
  type PaymentProviderButtonProps,
} from "../shared"

const SESSION_FIELDS =
  "id,payment_collection.payment_sessions.provider_id,payment_collection.payment_sessions.status,payment_collection.payment_sessions.data"

/**
 * USDC through x402 (t-2026-10-03-33). The backend put the payment
 * requirements on the session when the method was selected. At the click the
 * buyer's wallet signs an EIP-3009 transfer authorization, a new session
 * carries it as `payment_signature`, and the order placement makes the backend
 * verify and settle it. A session that is already settled (paid, order not yet
 * placed) is not signed again; the order is simply placed.
 */
const X402PaymentButton = ({
  cart,
  notReady,
  label,
  cartUpdating,
  "data-testid": dataTestId,
}: PaymentProviderButtonProps) => {
  const t = useTranslations("CheckoutPage")
  const {
    submitting,
    setSubmitting,
    errorMessage,
    setErrorMessage,
    completeOrder,
  } = usePlaceOrder()
  const [walletError, setWalletError] = useState<string | null>(null)

  const required = x402SessionOf(cart)?.data.payment_required
  const ready = Boolean(required?.accepts?.length)
  const chosen = required ? pickRequirement(required.accepts) : null

  const handlePayment = async () => {
    setSubmitting(true)
    setErrorMessage(null)
    setWalletError(null)

    const fail = (key: string) => {
      setSubmitting(false)
      setWalletError(key)
    }

    const session = x402SessionOf(
      await retrieveCart(cart.id, SESSION_FIELDS).catch(() => null)
    )
    if (session?.data.settled_at) {
      await completeOrder()
      return
    }
    const paymentRequired = session?.data.payment_required
    if (!paymentRequired?.accepts?.length) {
      fail("paymentNotReady")
      return
    }

    const wallet = (window as unknown as { ethereum?: Eip1193Provider })
      .ethereum
    const result = await payWithWallet(wallet, paymentRequired)
    if ("error" in result) {
      fail(result.error)
      return
    }

    const refused = await initiatePaymentSessionOrReason(cart, {
      provider_id: X402_PROVIDER_ID,
      data: { payment_signature: result.signature },
    }).catch(() => ({ error: "paymentNotReady" as const }))
    if (refused) {
      fail(refused.error)
      return
    }

    await completeOrder()
  }

  return (
    <>
      <PaymentButtonShell
        label={label}
        onClick={handlePayment}
        disabled={notReady || !ready}
        loading={submitting || cartUpdating}
        errorMessage={walletError ?? errorMessage}
        errorTestId="x402-payment-error-message"
        data-testid={dataTestId ?? "submit-order-button"}
      />
      <Text
        size="small"
        className="mt-2 text-ui-fg-subtle"
        data-testid="x402-sign-hint"
      >
        {t("x402SignHint")}
      </Text>
      {chosen && isTestNetwork(chosen.network) && (
        <Text
          size="small"
          className="mt-1 text-ui-fg-subtle"
          data-testid="x402-test-network"
        >
          {t("x402TestNetwork")}
        </Text>
      )}
    </>
  )
}

export default X402PaymentButton
