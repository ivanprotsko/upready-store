/**
 * The pre-payment notice (rule 5zd, t-2026-10-03-32): the buyer is told,
 * right above the pay button, who they are paying, which documents they
 * accept, where paying redirects to, what currency the charge is in and at
 * what rate, and what the refund terms are — whenever paying means a
 * different currency, a foreign card, or another company's checkout.
 *
 * The owner edits one entry per payment method in «Настройки → Оплата»
 * (`PUT /tenants/payment-settings/pre-notice`); the backend publishes the
 * whole document on `GET /storefront/by-host` → `payment_pre_notice`, carried
 * here on the `x-tenant-payment-pre-notice` header the same way
 * `manual_payment` is.
 */

export const PAYMENT_PRE_NOTICE_PROVIDER_KEYS = ["robokassa", "tribute", "btcpay", "bitcart", "manual", "card"] as const
export type PaymentPreNoticeProviderKey = (typeof PAYMENT_PRE_NOTICE_PROVIDER_KEYS)[number]

export const PAYMENT_PRE_NOTICE_REDIRECT_KINDS = [
  "domain",
  "telegram_bot",
  "crypto_network",
  "bank",
] as const
export type PaymentPreNoticeRedirectKind = (typeof PAYMENT_PRE_NOTICE_REDIRECT_KINDS)[number]

export type PaymentPreNoticeEntry = {
  chargeCurrencyCode: string | null
  isForeignCard: boolean
  redirectKind: PaymentPreNoticeRedirectKind | null
  redirectValue: string | null
  rateSource: string | null
  refundTerms: string | null
}

export type TenantPaymentPreNotice = Record<PaymentPreNoticeProviderKey, PaymentPreNoticeEntry>

export const EMPTY_PRE_NOTICE_ENTRY: PaymentPreNoticeEntry = {
  chargeCurrencyCode: null,
  isForeignCard: false,
  redirectKind: null,
  redirectValue: null,
  rateSource: null,
  refundTerms: null,
}

export const EMPTY_PAYMENT_PRE_NOTICE: TenantPaymentPreNotice = {
  robokassa: { ...EMPTY_PRE_NOTICE_ENTRY },
  tribute: { ...EMPTY_PRE_NOTICE_ENTRY },
  btcpay: { ...EMPTY_PRE_NOTICE_ENTRY },
  bitcart: { ...EMPTY_PRE_NOTICE_ENTRY },
  manual: { ...EMPTY_PRE_NOTICE_ENTRY },
  card: { ...EMPTY_PRE_NOTICE_ENTRY },
}

/**
 * Which provider key a checkout `method.id` falls under, or `null` for a
 * method rule 5zd has no entry for (a gift card pays nothing out). `"card"`
 * covers every Stripe-family and PayPal provider: this starter's one bucket
 * for "a card gateway", same grouping `isStripeLike`/`isPaypal` already draw.
 */
export const preNoticeProviderKey = (providerId: string): PaymentPreNoticeProviderKey | null => {
  if (providerId.startsWith("pp_robokassa_")) return "robokassa"
  if (providerId.startsWith("pp_tribute_")) return "tribute"
  if (providerId.startsWith("pp_btcpay_")) return "btcpay"
  if (providerId.startsWith("pp_bitcart_")) return "bitcart"
  if (providerId.startsWith("pp_system_default")) return "manual"
  if (
    providerId.startsWith("pp_stripe_") ||
    providerId.startsWith("pp_medusa-") ||
    providerId.startsWith("pp_paypal")
  ) {
    return "card"
  }
  return null
}

const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null

const isRedirectKind = (value: string | null): value is PaymentPreNoticeRedirectKind =>
  value !== null && (PAYMENT_PRE_NOTICE_REDIRECT_KINDS as readonly string[]).includes(value)

const readEntry = (raw: unknown): PaymentPreNoticeEntry => {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const redirectKind = str(source.redirect_kind)

  return {
    chargeCurrencyCode: str(source.charge_currency_code)?.toLowerCase() ?? null,
    isForeignCard: Boolean(source.is_foreign_card),
    redirectKind: isRedirectKind(redirectKind) ? redirectKind : null,
    redirectValue: str(source.redirect_value),
    rateSource: str(source.rate_source),
    refundTerms: str(source.refund_terms),
  }
}

/** The backend's document (snake_case field names) into this module's typed, camelCase shape. */
export const readPaymentPreNotice = (raw: unknown): TenantPaymentPreNotice => {
  const doc = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const result = {} as TenantPaymentPreNotice

  for (const key of PAYMENT_PRE_NOTICE_PROVIDER_KEYS) {
    result[key] = readEntry(doc[key])
  }

  return result
}

/** From the request header the middleware wrote. Malformed JSON is not a 500 — the checkout renders no notice. */
export const parsePaymentPreNoticeHeader = (
  raw: string | null | undefined
): TenantPaymentPreNotice | null => {
  if (!raw) {
    return null
  }

  try {
    return readPaymentPreNotice(JSON.parse(raw))
  } catch {
    return null
  }
}

/**
 * Rule 5zd, point 1: the notice shows when at least one holds — the charge
 * currency differs from the cart's, the method is a foreign card, or paying
 * redirects to another domain, bot or wallet. Same currency, this shop's own
 * page, no redirect: nothing to disclose.
 */
export const shouldShowPrePaymentNotice = (
  entry: PaymentPreNoticeEntry,
  cartCurrencyCode: string
): boolean => {
  const currencyDiffers =
    !!entry.chargeCurrencyCode &&
    entry.chargeCurrencyCode.trim().toLowerCase() !== cartCurrencyCode.trim().toLowerCase()

  return currencyDiffers || entry.isForeignCard || entry.redirectKind !== null
}

/**
 * The seller named in the notice's first sentence: the legal name the shop
 * saved in its requisites, or its display name while there is none.
 *
 * Only these two fields. Rule 5zd never prints an INN, an OGRN or «ИП …» in
 * the notice: an international shop's requisites are already blanked at the
 * source (`strip-legal-entity.ts`, backend), and this function additionally
 * never even TAKES an `inn`/`ogrn` argument, so no caller can thread one
 * through it by mistake.
 */
export const sellerLabel = (seller: { name: string | null; legal_name: string | null }): string =>
  seller.legal_name ?? seller.name ?? ""

/**
 * The approximate charge amount, formatted. `currencyCode` is not always a
 * real ISO-4217 code — a crypto charge currency ("usdt", "usdc") is not, and
 * `Intl.NumberFormat` throws a `RangeError` at construction for one it does
 * not recognize, so the formatted fallback is plain digits plus the code.
 */
export const formatChargeAmount = (amount: number, currencyCode: string, locale: string): string => {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currencyDisplay: "symbol",
      currency: currencyCode.toUpperCase(),
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currencyCode.toUpperCase()}`
  }
}
