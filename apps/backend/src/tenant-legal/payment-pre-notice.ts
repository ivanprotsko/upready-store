/**
 * The pre-payment notice (rule 5zd, t-2026-10-03-32): per payment method,
 * what the buyer is told right above the pay button when paying means a
 * different currency, a foreign card, or another company's checkout.
 *
 * Stored in `tenant.metadata.payment_pre_notice`, one JSON document keyed by
 * provider, the same convention `manual_payment`/`branding`/`analytics` use —
 * merged on every write so a route never clobbers a sibling key, and no
 * migration needed.
 */

export const PAYMENT_PRE_NOTICE_PROVIDER_KEYS = ["robokassa", "tribute", "btcpay", "manual", "card"] as const;
export type PaymentPreNoticeProviderKey = (typeof PAYMENT_PRE_NOTICE_PROVIDER_KEYS)[number];

export const PAYMENT_PRE_NOTICE_REDIRECT_KINDS = [
  "domain",
  "telegram_bot",
  "crypto_network",
  "bank",
] as const;
export type PaymentPreNoticeRedirectKind = (typeof PAYMENT_PRE_NOTICE_REDIRECT_KINDS)[number];

export type PaymentPreNoticeEntry = {
  charge_currency_code: string | null;
  is_foreign_card: boolean;
  redirect_kind: PaymentPreNoticeRedirectKind | null;
  redirect_value: string | null;
  rate_source: string | null;
  refund_terms: string | null;
};

export type TenantPaymentPreNotice = Record<PaymentPreNoticeProviderKey, PaymentPreNoticeEntry>;

export const EMPTY_PRE_NOTICE_ENTRY: PaymentPreNoticeEntry = {
  charge_currency_code: null,
  is_foreign_card: false,
  redirect_kind: null,
  redirect_value: null,
  rate_source: null,
  refund_terms: null,
};

export const EMPTY_PAYMENT_PRE_NOTICE: TenantPaymentPreNotice = {
  robokassa: { ...EMPTY_PRE_NOTICE_ENTRY },
  tribute: { ...EMPTY_PRE_NOTICE_ENTRY },
  // ask-20261005-070255-438f: BTCPay takes the payment on the owner's own
  // server, another domain, in a coin the buyer picks there.
  btcpay: { ...EMPTY_PRE_NOTICE_ENTRY },
  manual: { ...EMPTY_PRE_NOTICE_ENTRY },
  card: { ...EMPTY_PRE_NOTICE_ENTRY },
};

const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const isRedirectKind = (value: string | null): value is PaymentPreNoticeRedirectKind =>
  value !== null && (PAYMENT_PRE_NOTICE_REDIRECT_KINDS as readonly string[]).includes(value);

const readEntry = (raw: unknown): PaymentPreNoticeEntry => {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const redirectKind = str(source.redirect_kind);

  return {
    charge_currency_code: str(source.charge_currency_code)?.toLowerCase() ?? null,
    is_foreign_card: Boolean(source.is_foreign_card),
    redirect_kind: isRedirectKind(redirectKind) ? redirectKind : null,
    redirect_value: str(source.redirect_value),
    rate_source: str(source.rate_source),
    refund_terms: str(source.refund_terms),
  };
};

/** `tenant.metadata.payment_pre_notice` as stored, defensively read: a shop that configured nothing gets every key empty. */
export const readPaymentPreNotice = (
  metadata: Record<string, unknown> | null | undefined,
): TenantPaymentPreNotice => {
  const raw = metadata?.payment_pre_notice;
  const doc = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const result = {} as TenantPaymentPreNotice;

  for (const key of PAYMENT_PRE_NOTICE_PROVIDER_KEYS) {
    result[key] = readEntry(doc[key]);
  }

  return result;
};

/** One provider's fields merged into the stored document; every other key, including every other provider, is untouched. */
export const storedPaymentPreNotice = (
  current: TenantPaymentPreNotice,
  key: PaymentPreNoticeProviderKey,
  patch: Partial<PaymentPreNoticeEntry>,
): TenantPaymentPreNotice => ({
  ...current,
  [key]: { ...current[key], ...patch },
});

/**
 * Rule 5zd, point 1: the notice shows when at least one holds — the charge
 * currency differs from the cart's, the method is a foreign card, or paying
 * redirects to another domain, bot or wallet. Same currency, this shop's own
 * page, no redirect: nothing to disclose.
 */
export const shouldShowPrePaymentNotice = (
  entry: PaymentPreNoticeEntry,
  cartCurrencyCode: string,
): boolean => {
  const currencyDiffers =
    !!entry.charge_currency_code &&
    entry.charge_currency_code.trim().toLowerCase() !== cartCurrencyCode.trim().toLowerCase();

  return currencyDiffers || entry.is_foreign_card || entry.redirect_kind !== null;
};

/** What `GET /storefront/by-host` publishes: the same document, nothing in it is secret. */
export const paymentPreNoticePublicView = (doc: TenantPaymentPreNotice): TenantPaymentPreNotice => doc;
