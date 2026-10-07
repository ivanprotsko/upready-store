import type { AbstractIntlMessages } from "next-intl"

import type { TenantManualPayment } from "@lib/tenant/manual-payment"
import type { TenantPaymentMethods } from "@lib/tenant/payment-methods"

/**
 * The interface dictionary a page hands to the browser (t-2026-10-08-13, part A6).
 *
 * `NextIntlClientProvider` with no `messages` of its own takes the whole catalogue of the
 * locale, and React writes it into the code of every page: 106 sections, about 45 thousand
 * characters. A visitor never sees most of it; whoever reads the page code does. There a
 * shop that takes Robokassa alone «offered» PayPal, iDeal, a cryptocurrency transfer to a
 * wallet and a demo card, and carried the starter's own placeholder notes.
 *
 * `clientMessages` takes the whole catalogue and what THIS shop has switched on, and returns
 * it without the strings of what is off. The decision is taken from the shop's and the
 * server's own data (`ClientMessageFacts`), never from a site's name: a shop that takes
 * cryptocurrency keeps every string it had.
 *
 * Three things hold this together.
 *
 * 1. KEYS are cut, never a section's name: a section whose every key went stays as an empty
 *    object, so every shop's page names the same sections. next-intl itself does not need
 *    it (measured on 4.12: a translator made for an absent section reports nothing until a
 *    key is read); it keeps the function to one mechanism, the removal of keys.
 * 2. A row's `keep` is true whenever ANY client reader of its keys can render. A key that is
 *    missing shows on the screen as its own name (`Section.key`) and is reported as
 *    `MISSING_MESSAGE`, so a row is written only when the reader's own condition is known,
 *    and it is named in `reason`. `useTranslations("ManualPayment")` at the top of the
 *    checkout's payment step is no reading of a key: only `t("…")` is.
 * 3. A server reader (`getTranslations`) is never affected: it reads the catalogue of the
 *    request, not this copy.
 *
 * A section with no row here is handed over whole. Moving every page to its own set of
 * sections is a different, larger change and is not made here.
 */
export type ClientMessageFacts = {
  /**
   * The host resolved to a shop (`x-tenant-handle`). A host with no shop behind it is a
   * single-store stand: its region may list any provider the starter knows, so its
   * dictionary goes whole.
   */
  shop: boolean
  /** The shop's own gateways, as `/storefront/by-host` counts them (`TenantPaymentMethods`). */
  btcpay: boolean
  bitcart: boolean
  x402: boolean
  /** `pp_system_default` is on the checkout's list at all: «Перевод по реквизитам» or the demo card. */
  systemDefault: boolean
  /** «Перевод по реквизитам» is on: the shop entered a requisite or a manager's contact. */
  manualPayment: boolean
  /** The demo card is the shop's only way to pay (`TenantPaymentMethods.demo`). */
  demo: boolean
  /** The demo card's form can render: `pp_system_default` is offered and «Перевод по реквизитам» is not. */
  demoCard: boolean
  /** The shop saved an analytics counter, so the consent banner is mounted. */
  analytics: boolean
  /** The starter's onboarding cookie is set, the one thing that mounts `OnboardingCta`. */
  onboarding: boolean
}

/** The facts out of what the request already carries; no backend call is made for them. */
export const clientMessageFacts = (input: {
  shop: boolean
  paymentMethods: TenantPaymentMethods
  manualPayment: Pick<TenantManualPayment, "enabled">
  analytics: { yandexMetricaId: string | null; ga4MeasurementId: string | null }
  onboarding: boolean
}): ClientMessageFacts => {
  const methods = input.paymentMethods
  // Both readings of «the shop takes a transfer»: the backend's (`manualCrypto`,
  // `manualManager`) and the checkout's own (`availableManualPaymentKinds` is `enabled`).
  // Either one keeps the strings.
  const manualPayment =
    input.manualPayment.enabled || methods.manualCrypto || methods.manualManager
  const systemDefault = manualPayment || methods.demo

  return {
    shop: input.shop,
    btcpay: methods.btcpay,
    bitcart: methods.bitcart,
    x402: methods.x402,
    systemDefault,
    manualPayment,
    demo: methods.demo,
    // The checkout draws the demo card when the manual provider is picked and
    // `availableManualPaymentKinds` is empty, which is `enabled === false`.
    demoCard: systemDefault && !input.manualPayment.enabled,
    analytics: Boolean(input.analytics.yandexMetricaId || input.analytics.ga4MeasurementId),
    onboarding: input.onboarding,
  }
}

export type ClientMessageRule = {
  section: string
  /** The keys of the section this row speaks for; `"*"` is every key of it. */
  keys: readonly string[] | "*"
  /** When the strings stay, in words. */
  condition: string
  /** Why they can go otherwise: who reads them and when that reader renders. */
  reason: string
  /** Every reader is a server component (`getTranslations`): no browser ever asks for the section. */
  serverOnly?: true
  keep: (facts: ClientMessageFacts) => boolean
}

/**
 * Every string `clientMessages` can cut, with the condition and the reason. The table is
 * the whole of the decision: a section or a key that is not named here is never touched
 * (`client-messages.test.ts` holds that, and that every row still names real keys).
 */
export const CLIENT_MESSAGE_RULES: readonly ClientMessageRule[] = [
  {
    section: "PaymentMethods",
    keys: [
      "pp_paypal_paypal",
      "pp_stripe_stripe",
      "pp_stripe-bancontact_stripe",
      "pp_stripe-ideal_stripe",
      "pp_medusa-payments_default",
    ],
    condition: "never for a shop; a host with no shop keeps them",
    reason:
      "labels of the starter's Stripe and PayPal rows. The backend every shop is served by registers Robokassa, Tribute, BTCPay, Bitcart, x402 and the built-in manual provider (apps/backend/medusa-config.ts) and none of these, so no shop's checkout can list them. The reader, `paymentMethodName`, asks `t.has` first.",
    keep: () => false,
  },
  {
    section: "PaymentMethods",
    keys: ["pp_btcpay_btcpay"],
    condition: "the shop's BTCPay Server store is on",
    reason:
      "label of the BTCPay row of the checkout, listed only when the shop has the gateway. `paymentMethodName` asks `t.has` first and falls back to the provider's title.",
    keep: (facts) => facts.btcpay,
  },
  {
    section: "PaymentMethods",
    keys: ["pp_bitcart_bitcart"],
    condition: "the shop's Bitcart store is on",
    reason: "label of the Bitcart row, the same reader and the same fallback as BTCPay.",
    keep: (facts) => facts.bitcart,
  },
  {
    section: "PaymentMethods",
    keys: ["pp_x402_x402"],
    condition: "the shop's x402 is on",
    reason: "label of the x402 row, the same reader and the same fallback as BTCPay.",
    keep: (facts) => facts.x402,
  },
  {
    section: "PaymentMethods",
    keys: ["pp_system_default"],
    condition: "the shop offers «Перевод по реквизитам» or has the demo card as its only way to pay",
    reason:
      "label of the manual provider's row; the backend lists `pp_system_default` only for a manual kind or as the last-resort demo card. The same reader and fallback.",
    keep: (facts) => facts.systemDefault,
  },
  {
    section: "ManualPayment",
    keys: "*",
    condition: "the shop offers «Перевод по реквизитам» (a requisite or a manager's contact is saved)",
    reason:
      "the transfer to a card or to a cryptocurrency wallet. Its client readers render only then: the checkout's requisites block (`offersRequisites`), and the order page's requisites list, receipt form and manager button, which `ManualPaymentHandover` draws only while the shop's manual payment is enabled.",
    keep: (facts) => facts.manualPayment,
  },
  {
    section: "DemoCard",
    keys: "*",
    condition: "the manual provider is offered and «Перевод по реквизитам» is not, so its form is the demo card",
    reason:
      "the demo card's fields and its «no money is charged» note. `DemoCardFields` and the decline text of `ManualPaymentButton` render only for the manual provider with no manual kind.",
    keep: (facts) => facts.demoCard,
  },
  {
    section: "CheckoutPage",
    keys: ["demoPaymentNotice"],
    condition: "the demo card is the shop's only way to pay",
    reason: "the checkout draws the notice under the same flag, `tenantPaymentMethods.demo`.",
    keep: (facts) => facts.demo,
  },
  {
    section: "CheckoutPage",
    keys: ["x402SignHint", "x402TestNetwork"],
    condition: "the shop's x402 is on",
    reason: "the two hints under `X402PaymentButton`, mounted only when x402 is the picked method.",
    keep: (facts) => facts.x402,
  },
  {
    section: "Errors",
    keys: ["x402WalletMissing", "x402WalletRejected", "x402NetworkFailed", "x402PaymentRefused"],
    condition: "the shop's x402 is on",
    reason: "refusals of the wallet flow (`lib/util/x402.ts`), which only `X402PaymentButton` starts.",
    keep: (facts) => facts.x402,
  },
  {
    section: "AnalyticsConsent",
    keys: "*",
    condition: "the shop saved a Yandex Metrica or a GA4 counter",
    reason: "the cookie banner. `Analytics` mounts it only with a counter and renders nothing without one.",
    keep: (facts) => facts.analytics,
  },
  {
    section: "OnboardingCta",
    keys: "*",
    condition: "the request carries the starter's onboarding cookie",
    reason:
      "the starter's «your test order was created» block. `OrderCompletedTemplate` mounts it under that cookie alone.",
    keep: (facts) => facts.onboarding,
  },
  {
    section: "ProductOnboardingCta",
    keys: "*",
    condition: "never",
    reason: "its one reader is a server component (`getTranslations`).",
    serverOnly: true,
    keep: () => false,
  },
  {
    section: "ContentPages",
    keys: "*",
    condition: "never",
    reason:
      "the starter's placeholder note and FAQ. Both readers are server components, and `guardStarterLegalPage` keeps the pages themselves away from a shop.",
    serverOnly: true,
    keep: () => false,
  },
  {
    section: "PromoBanner",
    keys: ["message"],
    condition: "never for a shop; a host with no shop keeps it",
    reason:
      "the starter's own promo line. `(main)/layout.tsx` suppresses the strip for every shop, and the strip reads the key only when it is drawn. `close` stays: the component asks for the section on every page.",
    keep: () => false,
  },
]

const isSection = (value: AbstractIntlMessages[string] | undefined): value is AbstractIntlMessages =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export function clientMessages(
  messages: AbstractIntlMessages,
  facts: ClientMessageFacts
): AbstractIntlMessages {
  if (!facts.shop) {
    return messages
  }

  const cut: AbstractIntlMessages = { ...messages }

  for (const rule of CLIENT_MESSAGE_RULES) {
    const section = cut[rule.section]

    if (rule.keep(facts) || !isSection(section)) {
      continue
    }

    const keys = rule.keys
    cut[rule.section] =
      keys === "*"
        ? {}
        : Object.fromEntries(Object.entries(section).filter(([key]) => !keys.includes(key)))
  }

  return cut
}
