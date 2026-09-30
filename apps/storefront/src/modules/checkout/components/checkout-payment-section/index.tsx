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
import { cartShippingAddressGaps } from "@lib/util/shipping-address"
import { paymentMethodName } from "@lib/util/payment"
import { pickActivePaymentMethod } from "@lib/util/pick-payment-method"
import type { TenantPaymentMethods } from "@lib/tenant/resolve"
import { CreditCard } from "@medusajs/icons"
import type { HttpTypes } from "@medusajs/types"
import AddressGapMessage from "@modules/checkout/components/address-gap-message"
import PaymentButton from "@modules/checkout/components/payment-button"
import { CHECKOUT_PAYMENT_ANCHOR } from "@modules/checkout/components/robokassa-retry-notice"
import ErrorMessage from "@modules/checkout/components/error-message"
import { StripePaymentContainer } from "@modules/checkout/components/payment-container"
import DemoCardFields, {
  EMPTY_DEMO_CARD,
  type DemoCardValue,
} from "@modules/checkout/components/demo-card-fields"
import CheckoutBillingSheet from "@modules/checkout/components/checkout-billing-sheet"
import ManualPaymentKindSelect from "@modules/checkout/components/manual-payment-kind-select"
import ManualPaymentInstructions from "@modules/checkout/components/manual-payment-instructions"
import {
  availableManualPaymentKinds,
  type ManualPaymentKind,
  type TenantManualPayment,
} from "@lib/tenant/manual-payment"
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
  /**
   * The shop's offline ways to pay on the manual provider (olavka-payments),
   * from the same server parent: crypto wallets and manager contacts the
   * owner entered in the panel. Both off means the manual provider renders
   * exactly as it did before, with the demo card.
   */
  manualPayment: TenantManualPayment
  /**
   * Which payment methods this shop has connected (t-2026-09-24-n10), from
   * the same server parent: whether `pp_system_default` is offered for a real
   * manual kind or only as the last-resort demo card, which decides how the
   * checkout labels it.
   */
  tenantPaymentMethods: TenantPaymentMethods
}

export default function CheckoutPaymentSection({
  cart,
  availablePaymentMethods,
  legal,
  manualPayment,
  tenantPaymentMethods,
}: CheckoutPaymentSectionProps) {
  const t = useTranslations("CheckoutPage")
  const tm = useTranslations("PaymentMethods")
  const latestSession = cart.payment_collection?.payment_sessions?.[0]

  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(() =>
    pickActivePaymentMethod(latestSession?.provider_id ?? "", availablePaymentMethods)
  )
  const [error, setError] = useState<string | null>(null)
  const [, setPaymentComplete] = useState(false)
  const [billingOpen, setBillingOpen] = useState(false)
  const [showBillingDetails, setShowBillingDetails] = useState(false)
  const [demoCard, setDemoCard] = useState<DemoCardValue>(EMPTY_DEMO_CARD)

  // The kinds this shop offers inside the manual provider (olavka-payments).
  // An empty list is the single-store case and every shop that configured
  // neither section: the manual provider then keeps its demo card and the
  // button its demo gate. With at least one kind the first is preselected, so
  // the buyer who never touches the choice still places a coherent order.
  const manualKinds = availableManualPaymentKinds(manualPayment)
  const [manualKind, setManualKind] = useState<ManualPaymentKind | null>(
    manualKinds[0] ?? null
  )

  // t-2026-09-24-n10: a method the shop offered when the page first rendered
  // can stop being connected before the buyer pays (the owner turns Robokassa
  // off, or its account expires mid-checkout) — the server parent re-fetches
  // `availablePaymentMethods` on every render, so this is where the stale
  // pick is caught and swapped for the first one still on offer, never a
  // crash on a provider the shop no longer has.
  useEffect(() => {
    setSelectedPaymentMethod((current) =>
      pickActivePaymentMethod(current, availablePaymentMethods)
    )
  }, [availablePaymentMethods])

  /**
   * Creating a payment session is not idempotent: `POST
   * /store/payment-collections/:id/payment-sessions` DELETES the collection's
   * current session and makes a new one with a new id. So two calls in flight
   * at once leave the page holding a session the server has already thrown
   * away — harmless for a provider whose «pay» happens in this tab, fatal for a
   * redirect provider, because the URL the customer leaves for carries the DEAD
   * session's `InvId` and `Shp_SessionID`: Robokassa takes the money and its
   * Result webhook then answers `unknown_session`, so the order is never
   * created (measured on the stand 2026-09-16 — two sessions milliseconds
   * apart, `payses_…94M` redirected and `payses_…0KM` stored).
   *
   * The duplicate came from THIS effect: the click's own `initiatePaymentSession`
   * is still in flight when a cart refresh lands with the session list as it was
   * BEFORE it — a new array, still empty — so `!latestSession` reads true and a
   * second session is created. The ref is the missing piece: an effect may only
   * replace a session nobody is creating right now.
   */
  const initiatingRef = useRef<string | null>(null)
  const startSession = (
    providerId: string,
    data: ReturnType<typeof buildPaymentSessionData>
  ) => {
    // Only a call for the SAME provider is a duplicate. Switching the method
    // while the previous one is still being created has to go through, or the
    // page would show one method selected and hold the other's session.
    if (initiatingRef.current === providerId) {
      return
    }
    initiatingRef.current = providerId
    return initiatePaymentSession(cart, { provider_id: providerId, data })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        if (initiatingRef.current === providerId) {
          initiatingRef.current = null
        }
      })
  }

  // Re-initiate payment session when it gets cleared (e.g. after promo code change)
  useEffect(() => {
    if (
      selectedPaymentMethod &&
      !latestSession &&
      !paidByGiftcard &&
      isPaymentSessionReady(selectedPaymentMethod, cart)
    ) {
      startSession(
        selectedPaymentMethod,
        buildPaymentSessionData(selectedPaymentMethod, cart)
      )
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

    startSession(selectedPaymentMethod, sessionData)
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

    await startSession(providerId, buildPaymentSessionData(providerId, cart))
  }

  const billingAddr = cart.billing_address
  const billingSameAsShipping = !!(
    cart.shipping_address &&
    billingAddr &&
    compareAddresses(cart.shipping_address, billingAddr)
  )
  // f04-address-without-city: `PaymentButton` disables itself on the same test.
  // A disabled button with no reason next to it reads as a broken shop, so the
  // missing half of the address is named here, field by field, with the same
  // sentences the address sheet shows (t-2026-09-24-n19).
  const addressGaps = cartShippingAddressGaps(cart)
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
    <div
      id={CHECKOUT_PAYMENT_ANCHOR}
      className="flex flex-col gap-y-6 scroll-mt-4"
    >
      {/* Payment methods */}
      {!paidByGiftcard && availablePaymentMethods.length > 0 && (
        <div className="flex flex-col gap-y-3">
          <h2 className="h2-docs">{t("paymentHeading")}</h2>

          {/* t-2026-09-24-n10: honest about pp_system_default's demo card once it
              is this shop's only way to pay, so a buyer never mistakes it for a
              real accepted method. */}
          {tenantPaymentMethods.demo && (
            <p
              className="txt-compact-xsmall text-ui-fg-subtle"
              data-testid="demo-payment-notice"
            >
              {t("demoPaymentNotice")}
            </p>
          )}

          <div className="flex gap-x-2 overflow-x-auto no-scrollbar pb-1">
            {availablePaymentMethods.map((method) => {
              const info = paymentInfoMap[method.id]
              const isSelected = selectedPaymentMethod === method.id

              return (
                <button
                  key={method.id}
                  type="button"
                  data-testid={`payment-method-${method.id}`}
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

          {/* The manual provider (olavka-payments): the shop's offline kinds when
              the owner enabled any, else the demo card of checkout mockup
              frames 6-8, exactly as before. */}
          {isManual(selectedPaymentMethod) &&
            (manualKinds.length > 0 ? (
              <div className="mt-2 flex flex-col gap-y-4">
                <ManualPaymentKindSelect
                  kinds={manualKinds}
                  wallets={manualPayment.crypto.wallets}
                  value={manualKind}
                  onChange={setManualKind}
                />
                {manualKind && (
                  <ManualPaymentInstructions
                    kind={manualKind}
                    manualPayment={manualPayment}
                  />
                )}
              </div>
            ) : (
              <div className="mt-2">
                <DemoCardFields value={demoCard} onChange={setDemoCard} />
              </div>
            ))}
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

      <AddressGapMessage
        gaps={addressGaps}
        data-testid="shipping-address-incomplete"
      />

      <div className="flex flex-col gap-y-3">
        <PaymentButton
          cart={cart}
          selectedPaymentMethod={selectedPaymentMethod}
          demoCard={demoCard}
          manualKind={manualKinds.length > 0 ? manualKind : null}
          data-testid="submit-order-button"
        />
        <p className="txt-compact-2xsmall text-ui-fg-subtle text-center px-2">
          {t.rich("legal", {
            terms: legalChunk("terms"),
            // Its own slot since b14-pages-legal-content: the sentence names
            // two documents and used to underline one.
            termsOfUse: legalChunk("termsOfUse"),
            returnPolicy: legalChunk("returns"),
            privacyPolicy: legalChunk("privacy"),
          })}
        </p>
      </div>
    </div>
  )
}
