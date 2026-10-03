"use client"

import { useState, useEffect, useRef, type ReactNode } from "react"
import { initiatePaymentSession } from "@lib/data/cart"
import { getChargeEstimate } from "@lib/data/payment"
import {
  buildPaymentSessionData,
  isManual,
  isPaymentSessionReady,
  isStripeLike,
  paymentInfoMap,
} from "@lib/constants"
import compareAddresses from "@lib/util/compare-addresses"
import { cartNeedsShipping, cartShippingAddressGaps } from "@lib/util/shipping-address"
import { paymentMethodName } from "@lib/util/payment"
import { pickActivePaymentMethod } from "@lib/util/pick-payment-method"
import type { TenantPaymentMethods } from "@lib/tenant/resolve"
import { CreditCard, CheckMini } from "@medusajs/icons"
import type { HttpTypes } from "@medusajs/types"
import AddressGapMessage from "@modules/checkout/components/address-gap-message"
import PaymentButton from "@modules/checkout/components/payment-button"
import PaymentPreNotice from "@modules/checkout/components/payment-pre-notice"
import { CHECKOUT_PAYMENT_ANCHOR } from "@modules/checkout/components/robokassa-retry-notice"
import ErrorMessage from "@modules/checkout/components/error-message"
import { StripePaymentContainer } from "@modules/checkout/components/payment-container"
import DemoCardFields, {
  EMPTY_DEMO_CARD,
  isDemoCardComplete,
  type DemoCardValue,
} from "@modules/checkout/components/demo-card-fields"
import CheckoutBillingSheet from "@modules/checkout/components/checkout-billing-sheet"
import { RequisitesPreview } from "@modules/order/components/requisites-list"
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
import {
  EMPTY_PRE_NOTICE_ENTRY,
  preNoticeProviderKey,
  shouldShowPrePaymentNotice,
  type TenantPaymentPreNotice,
} from "@lib/util/payment-pre-notice"
import { useLocale, useTranslations } from "next-intl"
import { convertToLocale } from "@lib/util/money"
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
  /** Batch 6, Q3.1: a guest with a course in the cart — the pay button waits for a sign-in. */
  requiresSignIn?: boolean
  /** The pre-payment notice's per-method fields (rule 5zd, t-2026-10-03-32), from the same server parent. */
  prePaymentNotice: TenantPaymentPreNotice
  /** The seller named in the notice (`sellerLabel`), from the same server parent — a client component must not read the tenant's requisites itself (rule 19g). */
  seller: string
}

export default function CheckoutPaymentSection({
  cart,
  availablePaymentMethods,
  legal,
  manualPayment,
  tenantPaymentMethods,
  requiresSignIn = false,
  prePaymentNotice,
  seller,
}: CheckoutPaymentSectionProps) {
  const t = useTranslations("CheckoutPage")
  const tm = useTranslations("PaymentMethods")
  const tmp = useTranslations("ManualPayment")
  const tb = useTranslations("PaymentButton")
  const locale = useLocale()
  const latestSession = cart.payment_collection?.payment_sessions?.[0]

  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(() =>
    pickActivePaymentMethod(latestSession?.provider_id ?? "", availablePaymentMethods)
  )
  const [error, setError] = useState<string | null>(null)
  const [, setPaymentComplete] = useState(false)
  const [billingOpen, setBillingOpen] = useState(false)
  const [showBillingDetails, setShowBillingDetails] = useState(false)
  const [demoCard, setDemoCard] = useState<DemoCardValue>(EMPTY_DEMO_CARD)

  // Batch 7: ONE kind inside the manual provider, «Перевод по реквизитам», when
  // the owner entered a requisite or a contact; the bank or the wallet is picked
  // on the order page. An empty list is the single-store case and every shop
  // that configured nothing: the manual provider then keeps its demo card and
  // the button its demo gate.
  const manualKinds = availableManualPaymentKinds(manualPayment)
  const manualKind: ManualPaymentKind | null = manualKinds[0] ?? null
  const offersRequisites = manualKind !== null

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
  // Batch 6 (hotfix Plan B): no «Платежный адрес» for a cart with nothing to post —
  // there is no delivery address for it to match or differ from.
  const needsShipping = cartNeedsShipping(cart)
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

  // t-2026-10-01-checkout-ivan-3 #3: the same two gates `PaymentButton` uses
  // to disable «Place order» — a method is picked, the backend is ready for
  // it, and (the manual provider's own demo card) it is filled in.
  const manualCardIncomplete = Boolean(
    isManual(selectedPaymentMethod) &&
      !manualKind &&
      !isDemoCardComplete(demoCard)
  )
  const isPaymentComplete =
    !!selectedPaymentMethod &&
    isPaymentSessionReady(selectedPaymentMethod, cart) &&
    !manualCardIncomplete

  // Rule 5zd (t-2026-10-03-32): the pre-payment notice. The method just
  // picked decides which of the four configured entries applies; a method
  // this rule has no bucket for (a gift card, say) gets the empty entry,
  // which never triggers the notice.
  const activePreNoticeKey = selectedPaymentMethod ? preNoticeProviderKey(selectedPaymentMethod) : null
  const activePreNoticeEntry = activePreNoticeKey ? prePaymentNotice[activePreNoticeKey] : EMPTY_PRE_NOTICE_ENTRY
  const showPreNotice =
    !!selectedPaymentMethod && !paidByGiftcard && shouldShowPrePaymentNotice(activePreNoticeEntry, cart.currency_code)

  // The «≈ amount» needs a round trip only while it could ever be shown: a
  // charge currency that differs from the cart's, with a rate source on
  // file. Anything else renders with no amount and asks the backend for
  // nothing.
  const estimateCurrency = activePreNoticeEntry.chargeCurrencyCode
  const needsChargeEstimate =
    showPreNotice &&
    !!estimateCurrency &&
    !!activePreNoticeEntry.rateSource &&
    estimateCurrency !== cart.currency_code.trim().toLowerCase()

  const [chargeEstimate, setChargeEstimate] = useState<number | null>(null)

  useEffect(() => {
    if (!needsChargeEstimate || !estimateCurrency) {
      setChargeEstimate(null)
      return
    }

    let stillActive = true
    getChargeEstimate(cart.id, estimateCurrency).then((amount) => {
      if (stillActive) {
        setChargeEstimate(amount)
      }
    })

    return () => {
      stillActive = false
    }
  }, [needsChargeEstimate, estimateCurrency, cart.id])

  const buttonText = manualKind && isManual(selectedPaymentMethod) ? tb("placeOrderManual") : tb("placeOrder")

  return (
    // t-2026-10-01-checkout-ivan-3 #5: full width on its own, like
    // `CheckoutShippingSection` — every block below is wrapped into the
    // 736px column (.checkout-section-container, globals.css) except the
    // method row, which bleeds past it the delivery row's own way.
    <div
      id={CHECKOUT_PAYMENT_ANCHOR}
      className="flex flex-col gap-y-6 scroll-mt-4"
    >
      {/* Payment methods */}
      {!paidByGiftcard && availablePaymentMethods.length > 0 && (
        <div className="flex flex-col gap-y-3">
          <div className="checkout-section-container flex flex-col gap-y-3">
            <h2 className="h2-docs flex items-center gap-x-1.5">
              {t("paymentHeading")}
              {isPaymentComplete && (
                <CheckMini
                  className="text-ui-tag-green-icon shrink-0"
                  aria-hidden
                  data-testid="payment-section-checkmark"
                />
              )}
            </h2>

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
          </div>

          {/* 368px is half of `max-w-checkout` (736px) — same full-bleed
              trick as the delivery row, so this one starts on the same
              column edge and can scroll past it too. Below `lg`, "the
              column" is the page gutter (`px-4`, same as .checkout-section-
              container), not the viewport edge. */}
          <div className="flex gap-x-2 overflow-x-auto no-scrollbar px-4 scroll-px-4 pb-1 lg:pl-[calc(50%-368px)] lg:pr-[calc(50%-368px)] lg:scroll-pl-[calc(50%-368px)] lg:scroll-pr-[calc(50%-368px)]">
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
                        {isManual(method.id) && offersRequisites
                          ? tmp("methodRequisites")
                          : paymentMethodName(tm, method.id)}
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

          <div className="checkout-section-container flex flex-col gap-y-3">
            {/* Stripe card input */}
            {isStripeLike(selectedPaymentMethod) && (
              <div>
                <StripePaymentContainer
                  paymentProviderId={selectedPaymentMethod}
                  selectedPaymentOptionId={selectedPaymentMethod}
                  paymentInfoMap={paymentInfoMap}
                  setError={setError}
                  setPaymentComplete={setPaymentComplete}
                />
              </div>
            )}

            {/* The manual provider (olavka-payments → batch 7): «Перевод по
                реквизитам» — what happens after «Оформить заказ» and which banks
                and assets the shop takes (the numbers come on the order page) —
                else the demo card of checkout mockup frames 6-8, exactly as before. */}
            {isManual(selectedPaymentMethod) &&
              (offersRequisites ? (
                <div
                  className="flex flex-col gap-y-3 rounded-[6px] border border-ui-border-base bg-ui-bg-base p-4"
                  data-testid="manual-payment-requisites"
                >
                  <p className="txt-compact-small text-ui-fg-base">
                    {tmp("requisitesDesc", {
                      total: convertToLocale({
                        amount: cart.total ?? 0,
                        currency_code: cart.currency_code,
                        locale,
                      }),
                    })}
                  </p>
                  {manualPayment.requisites.length > 0 && (
                    <>
                      <p className="txt-compact-xsmall text-ui-fg-subtle">{tmp("requisitesPreviewLabel")}</p>
                      <RequisitesPreview requisites={manualPayment.requisites} />
                    </>
                  )}
                  {manualPayment.contacts.note && (
                    <p className="txt-compact-small text-ui-fg-base" data-testid="manager-note">
                      {manualPayment.contacts.note}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <DemoCardFields value={demoCard} onChange={setDemoCard} />
                </div>
              ))}
          </div>
        </div>
      )}

      {paidByGiftcard && (
        <div className="checkout-section-container flex flex-col gap-y-1">
          <h2 className="h2-docs">{t("paymentHeading")}</h2>
          <p className="txt-compact-small text-ui-fg-subtle">{t("giftCard")}</p>
        </div>
      )}

      {/* Billing address */}
      {!needsShipping ? null : billingSameAsShipping && !showBillingDetails ? (
        <label className="checkout-section-container flex items-center gap-x-2 cursor-pointer">
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
        <div className="checkout-section-container flex flex-col gap-y-2">
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

      {needsShipping && (
      <CheckoutBillingSheet
        open={billingOpen}
        onClose={() => setBillingOpen(false)}
        initialSameAsShipping={billingSameAsShipping && !showBillingDetails}
        onSaved={(sameAsShipping) => setShowBillingDetails(!sameAsShipping)}
        cart={cart}
      />
      )}

      <div className="checkout-section-container">
        <ErrorMessage error={error} data-testid="payment-method-error-message" />
      </div>

      <div className="checkout-section-container">
        <AddressGapMessage
          gaps={addressGaps}
          tone="hint"
          data-testid="shipping-address-incomplete"
        />
      </div>

      <div className="checkout-section-container flex flex-col gap-y-3">
        {/* Rule 5zd (t-2026-10-03-32): right above the button and the total,
            never a modal — the buyer sees it before clicking «Pay». */}
        {showPreNotice && (
          <PaymentPreNotice
            entry={activePreNoticeEntry}
            buttonText={buttonText}
            seller={seller}
            legal={legal}
            amount={chargeEstimate}
          />
        )}
        <PaymentButton
          cart={cart}
          selectedPaymentMethod={selectedPaymentMethod}
          demoCard={demoCard}
          manualKind={manualKinds.length > 0 ? manualKind : null}
          requiresSignIn={requiresSignIn}
          data-testid="submit-order-button"
        />
        <p className="txt-compact-2xsmall text-ui-fg-subtle text-center px-2">
          {/* Batch 7: the sentence names the button's own words — «Оформить заказ»
              for a transfer by requisites, «Оплатить» for a gateway. The catalogs
              that carry a `{button}` placeholder in `legal` substitute it; the rest
              keep today's generic wording (the extra value is simply unused). */}
          {t.rich("legal", {
            button: buttonText,
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
