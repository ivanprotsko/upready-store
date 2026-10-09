"use client"

import { Fragment, useId, useMemo, useState, useEffect, useRef, type ReactNode } from "react"
import { initiatePaymentSessionOrReason, updateCart } from "@lib/data/cart"
import { getChargeConversionFactor } from "@lib/data/payment"
import {
  buildPaymentSessionData,
  isBitcart,
  isBtcpay,
  isX402,
  isManual,
  isPaymentSessionReady,
  isRobokassa,
  isStripeLike,
  paymentInfoMap,
} from "@lib/constants"
import {
  CHECKOUT_CONSENT_METADATA_KEY,
  buildConsentRecord,
  readConsentRecord,
  restoreConsent,
  type CheckoutConsentValue,
} from "@lib/util/checkout-consent"
import CheckoutConsent from "@modules/checkout/components/checkout-consent"
import compareAddresses from "@lib/util/compare-addresses"
import { cartNeedsShipping, cartShippingAddressGaps } from "@lib/util/shipping-address"
import { paymentMethodName } from "@lib/util/payment"
import { pickActivePaymentMethod } from "@lib/util/pick-payment-method"
import {
  groupRobokassaMethods,
  isRobokassaSbp,
  parsePaymentChoice,
  pickRobokassaMethod,
  robokassaChoiceValue,
  robokassaGroupLabelKey,
  robokassaMethodLabel,
  robokassaMethodsForCart,
  type RobokassaMethod,
} from "@lib/util/robokassa-methods"
import type { TenantPaymentMethods } from "@lib/tenant/resolve"
import { Bolt, CreditCard, CheckMini } from "@medusajs/icons"
import type { HttpTypes } from "@medusajs/types"
import AddressGapMessage from "@modules/checkout/components/address-gap-message"
import PaymentButton from "@modules/checkout/components/payment-button"
import PaymentPreNotice from "@modules/checkout/components/payment-pre-notice"
import { CHECKOUT_PAYMENT_ANCHOR } from "@modules/checkout/components/robokassa-retry-notice"
import RobokassaTermsLinks from "@modules/checkout/components/robokassa-terms-links"
import LegalPageLink from "@modules/checkout/components/legal-page-link"
import ErrorMessage from "@modules/checkout/components/error-message"
import PaymentSessionError from "@modules/checkout/components/payment-session-error"
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
import { Checkbox, Label, RadioGroup, clx } from "@medusajs/ui"
import { useLocaleDirection } from "@lib/hooks/use-locale-direction"

/**
 * One block of the payment list: a Robokassa group under its heading
 * (t-2026-10-04-19), or a provider's single row with no heading.
 */
type PaymentChoiceSection = {
  key: string
  headingId: string | null
  heading: string | null
  rows: {
    value: string
    testId: string
    label: string
    processor: string
    icon: ReactNode
  }[]
}

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
  /**
   * The Robokassa methods the shop has enabled (t-2026-10-04-49), from the
   * same server parent; `null` when the backend could not say, and the list
   * falls back to card and SBP. Each one is a row of its own.
   */
  robokassaMethods?: RobokassaMethod[] | null
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
  robokassaMethods = null,
  requiresSignIn = false,
  prePaymentNotice,
  seller,
}: CheckoutPaymentSectionProps) {
  const t = useTranslations("CheckoutPage")
  const tm = useTranslations("PaymentMethods")
  const tmp = useTranslations("ManualPayment")
  const tb = useTranslations("PaymentButton")
  const locale = useLocale()
  const dir = useLocaleDirection()
  const billingCheckboxId = useId()
  const latestSession = cart.payment_collection?.payment_sessions?.[0]

  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(() =>
    pickActivePaymentMethod(latestSession?.provider_id ?? "", availablePaymentMethods)
  )
  // t-2026-10-04-49: Robokassa is not one row but one per method the shop
  // enabled («Банковская карта», «СБП»…). The alias picked here only decides
  // which method Robokassa opens on; it is not part of the payment session, so
  // switching between these rows creates no new session (and no new `InvId`).
  // t-2026-10-04-19 (P7): the rows stand in groups, Russian cards, foreign cards,
  // SBP and the rest, each under its heading; a group the shop has no method in
  // is left out. The first row of the first group is the one preselected.
  const robokassaGroups = useMemo(
    () => groupRobokassaMethods(robokassaMethodsForCart(robokassaMethods, cart.total)),
    [robokassaMethods, cart.total]
  )
  const robokassaRows = useMemo(
    () => robokassaGroups.flatMap((entry) => entry.methods),
    [robokassaGroups]
  )
  const groupHeadingId = useId()
  const [robokassaMethod, setRobokassaMethod] = useState<string | null>(() =>
    pickRobokassaMethod(null, robokassaRows)
  )
  // A method that left the list (the owner switched it off, the total moved
  // past its limit) hands the pick to the first one still on it.
  useEffect(() => {
    setRobokassaMethod((current) => pickRobokassaMethod(current, robokassaRows))
  }, [robokassaRows])
  const [error, setError] = useState<string | null>(null)
  // The payment session's own failure, apart from `error` (t-2026-10-04-44): a later
  // session that is made clears it, and its line offers a retry.
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [sessionRetrying, setSessionRetrying] = useState(false)
  const [, setPaymentComplete] = useState(false)
  const [billingOpen, setBillingOpen] = useState(false)
  const [showBillingDetails, setShowBillingDetails] = useState(false)
  const [demoCard, setDemoCard] = useState<DemoCardValue>(EMPTY_DEMO_CARD)
  const tc = useTranslations("CheckoutConsent")
  // 04.10 checklist C1–C5: never ticked in advance. A record this buyer left on this
  // cart is restored (t-2026-10-04-48, `restoreConsent`): back from Robokassa the boxes
  // read as they were ticked, and that record is already on the cart. Each change is
  // written onto the cart at once (C3), and the button waits for that write, so the
  // order is never placed ahead of its own consent record.
  const storedConsent = readConsentRecord(cart.metadata as Record<string, unknown> | null)
  const [consent, setConsent] = useState<CheckoutConsentValue>(() =>
    restoreConsent(storedConsent, legal)
  )
  const [consentSaving, setConsentSaving] = useState(false)
  const [consentRecorded, setConsentRecorded] = useState(() => consent.personalData)

  const changeConsent = async (next: CheckoutConsentValue) => {
    setConsent(next)
    setConsentSaving(true)
    setConsentRecorded(false)
    try {
      // Only this key: `updateCart` merges it into the metadata the backend holds,
      // so the contacts and the pickup point written since are kept.
      await updateCart({
        metadata: {
          [CHECKOUT_CONSENT_METADATA_KEY]: buildConsentRecord(
            next,
            legal,
            locale,
            new Date(),
            storedConsent
          ),
        },
      })
      setConsentRecorded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setConsentSaving(false)
    }
  }
  const consentGiven = consent.personalData && consentRecorded && !consentSaving
  // t-2026-10-09-56 (Ivan's item 6): the «отметьте согласие» line shows only after the
  // buyer tried to pay without the box ticked, not as a standing line under the button.
  const [payTriedWithoutConsent, setPayTriedWithoutConsent] = useState(false)

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
    setSessionError(null)
    // A refusal comes back as an `Errors` key, never as a thrown action
    // (t-2026-10-04-44). The catch is the action call itself failing.
    return initiatePaymentSessionOrReason(cart, { provider_id: providerId, data })
      .then((refused) => {
        if (refused) {
          setSessionError(refused.error)
        }
      })
      .catch((e) => setSessionError(e instanceof Error ? e.message : String(e)))
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

  const retrySession = async () => {
    if (
      !selectedPaymentMethod ||
      !isPaymentSessionReady(selectedPaymentMethod, cart)
    ) {
      setSessionError(null)
      return
    }

    setSessionRetrying(true)
    await startSession(
      selectedPaymentMethod,
      buildPaymentSessionData(selectedPaymentMethod, cart)
    )
    setSessionRetrying(false)
  }

  // The list's value: a Robokassa row carries its alias as well (`robokassaChoiceValue`).
  const choiceValue =
    isRobokassa(selectedPaymentMethod) && robokassaMethod
      ? robokassaChoiceValue(selectedPaymentMethod, robokassaMethod)
      : selectedPaymentMethod

  const handleSelectChoice = async (value: string) => {
    const { providerId, alias } = parsePaymentChoice(value)
    if (alias) {
      setRobokassaMethod(alias)
    }
    // Another Robokassa method on the same provider keeps the session it has.
    if (providerId !== selectedPaymentMethod) {
      await handleSelectPayment(providerId)
    }
  }

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
  // Batch 6 part 1: the sentences name what an address the buyer started still lacks.
  // Before anything is typed the address form is open above with its own fields, and
  // a list of «missing» fields under the button read as an error before any input.
  const shipping = cart.shipping_address
  const addressStarted = Boolean(
    shipping?.address_1 || shipping?.postal_code || shipping?.city
  )
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
      // t-2026-10-09-56 (Ivan's item 12): the document opens over the checkout.
      return href ? <LegalPageLink href={href}>{chunks}</LegalPageLink> : <>{chunks}</>
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

  // The backend hands back a CONVERSION FACTOR, not an amount (lead review,
  // t-2026-10-03-32): `cart.total` already has shipping, discounts and tax
  // folded in, the same number `CheckoutTotals` renders, so multiplying it
  // here is the real charge estimate — summing line items on the backend
  // was the first version's bug, it skipped all three.
  const [chargeFactor, setChargeFactor] = useState<number | null>(null)

  useEffect(() => {
    if (!needsChargeEstimate || !estimateCurrency) {
      setChargeFactor(null)
      return
    }

    let stillActive = true
    getChargeConversionFactor(cart.id, estimateCurrency).then((factor) => {
      if (stillActive) {
        setChargeFactor(factor)
      }
    })

    return () => {
      stillActive = false
    }
  }, [needsChargeEstimate, estimateCurrency, cart.id])

  const chargeEstimate = chargeFactor !== null ? Math.round(cart.total * chargeFactor * 100) / 100 : null

  const buttonText = manualKind && isManual(selectedPaymentMethod) ? tb("placeOrderManual") : tb("placeOrder")

  return (
    // Batch 6 part 1: one choice, one list. The methods are full-width rows in the
    // Medusa `RadioGroup.ChoiceBox` look, like the delivery methods above; what the
    // chosen one needs (the card fields, the requisites note) follows under the list.
    // Before, a tile («Оплата вручную», then «Перевод по реквизитам») stood above a
    // second card, two levels for one choice.
    <div
      id={CHECKOUT_PAYMENT_ANCHOR}
      className="flex flex-col gap-y-6 scroll-mt-24"
    >
      {/* Payment methods */}
      {!paidByGiftcard && availablePaymentMethods.length > 0 && (
        <div className="flex flex-col gap-y-3">
          <h2 className="h2-docs flex items-center gap-x-1.5">
            {t("paymentHeading")}
            {isPaymentComplete && (
              <CheckMini
                className="text-status-success shrink-0"
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

          <RadioGroup
            dir={dir}
            value={choiceValue}
            onValueChange={handleSelectChoice}
            className="flex flex-col gap-y-2"
          >
            {availablePaymentMethods
              .flatMap((method): PaymentChoiceSection[] => {
                if (isRobokassa(method.id)) {
                  return robokassaGroups.map((entry) => ({
                    key: `${method.id}-${entry.group}`,
                    headingId: `${groupHeadingId}-${entry.group}`,
                    heading: tm(robokassaGroupLabelKey(entry.group)),
                    rows: entry.methods.map((rk) => ({
                      value: robokassaChoiceValue(method.id, rk.alias),
                      testId: `payment-method-${method.id}-${rk.alias}`,
                      label: robokassaMethodLabel(tm, rk, locale),
                      processor: "Robokassa",
                      icon: isRobokassaSbp(rk.alias) ? (
                        <Bolt className="w-3 h-3" />
                      ) : (
                        <CreditCard className="w-3 h-3" />
                      ),
                    })),
                  }))
                }
                const info = paymentInfoMap[method.id]
                return [
                  {
                    key: method.id,
                    headingId: null,
                    heading: null,
                    rows: [
                      {
                        value: method.id,
                        testId: `payment-method-${method.id}`,
                        label:
                          isManual(method.id) && offersRequisites
                            ? tmp("methodRequisites")
                            : paymentMethodName(tm, method.id),
                        processor: method.id.includes("stripe")
                          ? "Stripe"
                          : method.id.includes("paypal")
                            ? "PayPal"
                            : isBtcpay(method.id)
                              ? "BTCPay Server"
                              : isBitcart(method.id)
                                ? "Bitcart"
                                : isX402(method.id)
                                  ? "x402"
                                  : "",
                        icon: info?.icon || <CreditCard className="w-3 h-3" />,
                      },
                    ],
                  },
                ]
              })
              .map((section) => {
                const rows = section.rows.map((row) => {
                  const isSelected = choiceValue === row.value

                  return (
                    <div
                      key={row.value}
                      className={clx(
                        "relative flex items-center gap-x-3 rounded-lg border px-4 py-3 text-start transition-colors",
                        // The theme's accent border on the chosen row, as on delivery.
                        isSelected
                          ? "border-ui-border-interactive bg-ui-bg-base"
                          : "border-ui-border-base bg-ui-bg-base hover:bg-ui-bg-base-hover"
                      )}
                    >
                      <RadioGroup.Item
                        value={row.value}
                        aria-label={row.label}
                        aria-describedby={section.headingId ?? undefined}
                        data-testid={row.testId}
                        className="absolute inset-0 z-10 h-full w-full cursor-pointer rounded-lg bg-transparent outline-none [&>div]:hidden focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                      />
                      {/* The radio mark of `RadioGroup.ChoiceBox`, the same as the
                          delivery rows draw. */}
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                        <div
                          className={clx(
                            "flex h-3.5 w-3.5 items-center justify-center rounded-full",
                            isSelected
                              ? "bg-ui-bg-interactive shadow-borders-interactive-with-shadow"
                              : "bg-ui-bg-base shadow-borders-base"
                          )}
                        >
                          {isSelected && (
                            <div className="h-1.5 w-1.5 rounded-full bg-ui-bg-base shadow-details-contrast-on-bg-interactive" />
                          )}
                        </div>
                      </div>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ui-bg-component shadow-borders-base">
                        {row.icon}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="txt-compact-medium-plus text-ui-fg-base">
                          {row.label}
                        </span>
                        {row.processor && (
                          <span className="txt-compact-small text-ui-fg-subtle">
                            {row.processor}
                          </span>
                        )}
                      </span>
                    </div>
                  )
                })

                if (!section.heading) {
                  return <Fragment key={section.key}>{rows}</Fragment>
                }
                // A heading over its group's rows. Each radio names it through
                // `aria-describedby`, since a radiogroup owns radios only and a
                // `role="group"` wrapper inside one is not valid ARIA.
                return (
                  <div
                    key={section.key}
                    className="flex flex-col gap-y-2 pt-2 first:pt-0"
                    data-testid={`payment-group-${section.key}`}
                  >
                    <p
                      id={section.headingId ?? undefined}
                      className="txt-compact-small-plus text-ui-fg-subtle"
                    >
                      {section.heading}
                    </p>
                    {rows}
                  </div>
                )
              })}
          </RadioGroup>

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
                className="flex flex-col gap-y-3 rounded-lg bg-ui-bg-subtle px-4 py-3"
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
      )}

      {paidByGiftcard && (
        <div className="flex flex-col gap-y-1">
          <h2 className="h2-docs">{t("paymentHeading")}</h2>
          <p className="txt-compact-small text-ui-fg-subtle">{t("giftCard")}</p>
        </div>
      )}

      {/* Billing address: a card processor's question only. A transfer by requisites,
          the demo card or a redirect gateway asks nothing of it, and a cart with
          nothing to post has no delivery address for it to match (batch 6). The
          cart's billing address follows the delivery one on its own (`setAddresses`). */}
      {!needsShipping || !isStripeLike(selectedPaymentMethod) ? null : billingSameAsShipping && !showBillingDetails ? (
        <div className="flex items-center gap-x-2">
          <Checkbox
            id={billingCheckboxId}
            checked
            onCheckedChange={() => setShowBillingDetails(true)}
          />
          <Label
            htmlFor={billingCheckboxId}
            className="txt-compact-small text-ui-fg-base cursor-pointer"
          >
            {t("billingSameAsShipping")}
          </Label>
        </div>
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

      {needsShipping && isStripeLike(selectedPaymentMethod) && (
      <CheckoutBillingSheet
        open={billingOpen}
        onClose={() => setBillingOpen(false)}
        initialSameAsShipping={billingSameAsShipping && !showBillingDetails}
        onSaved={(sameAsShipping) => setShowBillingDetails(!sameAsShipping)}
        cart={cart}
      />
      )}

      <PaymentSessionError
        error={sessionError}
        retrying={sessionRetrying}
        onRetry={retrySession}
      />

      <ErrorMessage error={error} data-testid="payment-method-error-message" />

      <AddressGapMessage
        gaps={addressStarted ? addressGaps : []}
        tone="hint"
        data-testid="shipping-address-incomplete"
      />

      <div className="flex flex-col gap-y-3">
        <CheckoutConsent
          value={consent}
          onChange={changeConsent}
          legal={legal}
          disabled={consentSaving}
        />
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
        {/* t-2026-10-09-56 (Ivan 09.10: «чтобы все уместилось максимум в 2 строки, и тем
            более без дубликатов»): two lines at most between the boxes and the button, each
            document named once. The first line is C2 of the 04.10 checklist: the offer is
            accepted by pressing the button (batch 7: the sentence names the button's own
            words), followed by C6, the 54-ФЗ receipt, where a receipt is actually issued:
            Robokassa, the Russian shop's gateway (fiscalised receipts, t-cherk-30); a transfer
            by requisites issues none, so it promises none. The policy is named once, in the
            personal-data box above. The second line is the payment and delivery terms the
            Robokassa contract (clause 4.3.4, t-2026-10-08-13) wants before paying, and the
            returns rules, the pair that used to stand again under the button. */}
        <div className="flex flex-col gap-y-1" data-testid="checkout-legal-lines">
          <p className="txt-compact-small text-ui-fg-subtle" data-testid="checkout-offer-line">
            {t.rich("legal", { button: buttonText, terms: legalChunk("terms") })}
            {isRobokassa(selectedPaymentMethod) && (
              <>
                {" "}
                <span data-testid="consent-receipt-note">{tc("receipt")}</span>
              </>
            )}
          </p>
          <RobokassaTermsLinks legal={legal} />
        </div>
        <div className="relative">
          <PaymentButton
            cart={cart}
            selectedPaymentMethod={selectedPaymentMethod}
            demoCard={demoCard}
            manualKind={manualKinds.length > 0 ? manualKind : null}
            robokassaMethod={isRobokassa(selectedPaymentMethod) ? robokassaMethod : null}
            requiresSignIn={requiresSignIn}
            consentGiven={consentGiven}
            data-testid="submit-order-button"
          />
          {/* A disabled button takes no click, so this layer over it catches the try
              while the personal-data box is empty, and the line below says why. */}
          {!consent.personalData && (
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              className="absolute inset-0 cursor-not-allowed rounded-md bg-transparent"
              onClick={() => setPayTriedWithoutConsent(true)}
              data-testid="consent-pay-attempt"
            />
          )}
        </div>
        {payTriedWithoutConsent && !consent.personalData && (
          <p
            className="txt-compact-small text-ui-fg-error text-center"
            role="alert"
            data-testid="consent-hint"
          >
            {tc("hint")}
          </p>
        )}
      </div>
    </div>
  )
}
