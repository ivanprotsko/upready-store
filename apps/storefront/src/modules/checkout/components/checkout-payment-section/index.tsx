"use client"

import { useState, useEffect, useRef, type ReactNode } from "react"
import { initiatePaymentSession } from "@lib/data/cart"
import {
  buildPaymentSessionData,
  isManual,
  isPaymentSessionReady,
  isStripeLike,
  paymentInfoMap,
} from "@lib/constants"
import compareAddresses from "@lib/util/compare-addresses"
import { paymentMethodName } from "@lib/util/payment"
import { CreditCard } from "@medusajs/icons"
import type { HttpTypes } from "@medusajs/types"
import PaymentButton from "@modules/checkout/components/payment-button"
import ErrorMessage from "@modules/checkout/components/error-message"
import { StripePaymentContainer } from "@modules/checkout/components/payment-container"
import DemoCardFields, {
  EMPTY_DEMO_CARD,
  type DemoCardValue,
} from "@modules/checkout/components/demo-card-fields"
import CheckoutBillingSheet from "@modules/checkout/components/checkout-billing-sheet"
import { Link } from "@i18n/navigation"
import {
  consentHref,
  type LegalLinkContext,
  type LegalSlot,
} from "@lib/util/legal-links"
import { useTranslations } from "next-intl"
import { clx } from "@medusajs/ui"

interface CheckoutPaymentSectionProps {
  cart: HttpTypes.StoreCart
  availablePaymentMethods: { id: string }[]
  /**
   * Which documents this shop has and where they live, from the server parent
   * (`checkout-summary`): this component is client, so it must not read the
   * tenant headers itself (rule 19g).
   */
  legal: LegalLinkContext
}

export default function CheckoutPaymentSection({
  cart,
  availablePaymentMethods,
  legal,
}: CheckoutPaymentSectionProps) {
  const t = useTranslations("CheckoutPage")
  const tm = useTranslations("PaymentMethods")
  const latestSession = cart.payment_collection?.payment_sessions?.[0]

  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(
    latestSession?.provider_id ?? ""
  )
  const [error, setError] = useState<string | null>(null)
  const [, setPaymentComplete] = useState(false)
  const [billingOpen, setBillingOpen] = useState(false)
  const [showBillingDetails, setShowBillingDetails] = useState(false)
  const [demoCard, setDemoCard] = useState<DemoCardValue>(EMPTY_DEMO_CARD)

  // Re-initiate payment session when it gets cleared (e.g. after promo code change)
  useEffect(() => {
    if (
      selectedPaymentMethod &&
      !latestSession &&
      !paidByGiftcard &&
      isPaymentSessionReady(selectedPaymentMethod, cart)
    ) {
      initiatePaymentSession(cart, {
        provider_id: selectedPaymentMethod,
        data: buildPaymentSessionData(selectedPaymentMethod, cart),
      }).catch((e) => setError(e instanceof Error ? e.message : String(e)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.payment_collection?.payment_sessions])

  const receiptContextKey = JSON.stringify({
    shippingAddress: cart.shipping_address,
    billingAddress: cart.billing_address,
    email: cart.email,
    shippingOptionIds: cart.shipping_methods?.map((m) => m.shipping_option_id),
    regionId: cart.region?.id,
  })

  const hasMounted = useRef(false)
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true
      return
    }

    if (!selectedPaymentMethod || paidByGiftcard) {
      return
    }

    if (!isPaymentSessionReady(selectedPaymentMethod, cart)) {
      return
    }

    const sessionData = buildPaymentSessionData(selectedPaymentMethod, cart)
    if (!sessionData) {
      return
    }

    initiatePaymentSession(cart, {
      provider_id: selectedPaymentMethod,
      data: sessionData,
    }).catch((e) => setError(e instanceof Error ? e.message : String(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptContextKey])

  const paidByGiftcard = !!(
    (cart as unknown as Record<string, unknown>)?.gift_cards &&
    ((cart as unknown as Record<string, unknown>)?.gift_cards as unknown[])
      ?.length > 0 &&
    cart?.total === 0
  )

  const handleSelectPayment = async (providerId: string) => {
    setSelectedPaymentMethod(providerId)

    if (!isPaymentSessionReady(providerId, cart)) {
      return
    }

    try {
      await initiatePaymentSession(cart, {
        provider_id: providerId,
        data: buildPaymentSessionData(providerId, cart),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const billingAddr = cart.billing_address
  const billingSameAsShipping = !!(
    cart.shipping_address &&
    billingAddr &&
    compareAddresses(cart.shipping_address, billingAddr)
  )
  const billingText = billingAddr
    ? [billingAddr.address_1, billingAddr.city, billingAddr.postal_code]
        .filter(Boolean)
        .join(", ")
    : null

  /**
   * One chunk of the consent sentence, linked to the document it names. The
   * sentence tells the buyer which documents they accept by paying, so the link
   * must reach the shop's own text: `consentHref` resolves the slot to the
   * tenant's page, falls back to the contract (the offer) for a document the
   * shop has not written separately, and answers null only when the shop has no
   * legal page at all. Null renders the words as plain text, never as a link to
   * the starter's "this is a placeholder" page (f05-checkout-legal-stubs).
   */
  const legalChunk = (slot: LegalSlot) => {
    const href = consentHref(slot, legal)

    // A named function expression, because `react/display-name` counts any
    // anonymous function that returns JSX as a component without a name.
    return function LegalChunk(chunks: ReactNode) {
      return href ? (
        <Link href={href} className="underline">
          {chunks}
        </Link>
      ) : (
        <>{chunks}</>
      )
    }
  }

  return (
    <div className="flex flex-col gap-y-6">
      {/* Payment methods */}
      {!paidByGiftcard && availablePaymentMethods.length > 0 && (
        <div className="flex flex-col gap-y-3">
          <h2 className="h2-docs">{t("paymentHeading")}</h2>

          <div className="flex gap-x-2 overflow-x-auto no-scrollbar pb-1">
            {availablePaymentMethods.map((method) => {
              const info = paymentInfoMap[method.id]
              const isSelected = selectedPaymentMethod === method.id

              return (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => handleSelectPayment(method.id)}
                  className={clx(
                    "flex-shrink-0 w-[111px] p-[10px] rounded-[6px] border text-start transition-colors",
                    isSelected
                      ? "border-ui-border-interactive bg-ui-bg-base"
                      : "border-ui-border-base bg-ui-bg-base hover:border-ui-border-interactive/50"
                  )}
                >
                  <div className="flex flex-col gap-y-2">
                    <div className="w-6 h-6 rounded-full bg-ui-bg-component border border-ui-border-base flex items-center justify-center">
                      {info?.icon || <CreditCard className="w-3 h-3" />}
                    </div>
                    <div className="flex flex-col">
                      <span className="txt-compact-xsmall-plus text-ui-fg-base leading-tight">
                        {paymentMethodName(tm, method.id)}
                      </span>
                      <span className="txt-compact-xsmall text-ui-fg-subtle">
                        {method.id.includes("stripe")
                          ? "Stripe"
                          : method.id.includes("paypal")
                          ? "PayPal"
                          : ""}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Stripe card input */}
          {isStripeLike(selectedPaymentMethod) && (
            <div className="mt-2">
              <StripePaymentContainer
                paymentProviderId={selectedPaymentMethod}
                selectedPaymentOptionId={selectedPaymentMethod}
                paymentInfoMap={paymentInfoMap}
                setError={setError}
                setPaymentComplete={setPaymentComplete}
              />
            </div>
          )}

          {/* Demo card input — the manual provider, checkout mockup frames 6-8 */}
          {isManual(selectedPaymentMethod) && (
            <div className="mt-2">
              <DemoCardFields value={demoCard} onChange={setDemoCard} />
            </div>
          )}
        </div>
      )}

      {paidByGiftcard && (
        <div className="flex flex-col gap-y-1">
          <h2 className="h2-docs">{t("paymentHeading")}</h2>
          <p className="txt-compact-small text-ui-fg-subtle">{t("giftCard")}</p>
        </div>
      )}

      {/* Billing address */}
      {billingSameAsShipping && !showBillingDetails ? (
        <label className="flex items-center gap-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked
            onChange={() => setShowBillingDetails(true)}
            className="w-4 h-4 rounded border-ui-border-base accent-ui-fg-interactive"
          />
          <span className="txt-compact-small text-ui-fg-base">
            {t("billingSameAsShipping")}
          </span>
        </label>
      ) : (
        <div className="flex flex-col gap-y-2">
          <div className="flex items-center justify-between">
            <h2 className="h2-docs">{t("billingHeading")}</h2>
            <button
              type="button"
              onClick={() => setBillingOpen(true)}
              className="txt-compact-small-plus text-ui-fg-interactive hover:text-ui-fg-interactive-hover transition-colors"
            >
              {t("edit")}
            </button>
          </div>
          {billingText ? (
            <p className="txt-medium text-ui-fg-base">{billingText}</p>
          ) : (
            <p className="txt-compact-small text-ui-fg-subtle">
              {t("sameAsShipping")}
            </p>
          )}
        </div>
      )}

      <CheckoutBillingSheet
        open={billingOpen}
        onClose={() => setBillingOpen(false)}
        initialSameAsShipping={billingSameAsShipping && !showBillingDetails}
        onSaved={(sameAsShipping) => setShowBillingDetails(!sameAsShipping)}
        cart={cart}
      />

      <ErrorMessage error={error} data-testid="payment-method-error-message" />

      <div className="flex flex-col gap-y-3">
        <PaymentButton
          cart={cart}
          selectedPaymentMethod={selectedPaymentMethod}
          demoCard={demoCard}
          data-testid="submit-order-button"
        />
        <p className="txt-compact-2xsmall text-ui-fg-subtle text-center px-2">
          {t.rich("legal", {
            terms: legalChunk("terms"),
            termsOfUse: legalChunk("terms"),
            returnPolicy: legalChunk("returns"),
            privacyPolicy: legalChunk("privacy"),
          })}
        </p>
      </div>
    </div>
  )
}
