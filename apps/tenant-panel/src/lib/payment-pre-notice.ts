/**
 * Предупреждение перед оплатой (rule 5zd, t-2026-10-03-32): показывается,
 * когда валюта списания отличается от валюты корзины, способ — иностранная
 * карта, или оплату принимает другое лицо/домен. Plain TS, no JSX, so this
 * is imported and run for real in its own test (same note as
 * `payment-methods-summary.ts`).
 */

export const PAYMENT_PRE_NOTICE_PROVIDER_KEYS = ["robokassa", "tribute", "manual", "card"] as const
export type PaymentPreNoticeProviderKey = (typeof PAYMENT_PRE_NOTICE_PROVIDER_KEYS)[number]

export const PAYMENT_PRE_NOTICE_REDIRECT_KINDS = [
  "domain",
  "telegram_bot",
  "crypto_network",
  "bank",
] as const
export type PaymentPreNoticeRedirectKind = (typeof PAYMENT_PRE_NOTICE_REDIRECT_KINDS)[number]

export type PaymentPreNoticeEntry = {
  charge_currency_code: string | null
  is_foreign_card: boolean
  redirect_kind: PaymentPreNoticeRedirectKind | null
  redirect_value: string | null
  rate_source: string | null
  refund_terms: string | null
}

export const EMPTY_PRE_NOTICE_ENTRY: PaymentPreNoticeEntry = {
  charge_currency_code: null,
  is_foreign_card: false,
  redirect_kind: null,
  redirect_value: null,
  rate_source: null,
  refund_terms: null,
}

/**
 * Rule 5zd, п.1: показываем, если хотя бы одно верно — валюта списания
 * отличается от валюты корзины, способ — иностранная карта, или есть
 * редирект на другой домен/бот/кошелёк. Своя страница, та же валюта —
 * уведомления нет.
 */
export const shouldShowPrePaymentNotice = (
  entry: PaymentPreNoticeEntry,
  cartCurrencyCode: string,
): boolean => {
  const currencyDiffers =
    !!entry.charge_currency_code &&
    entry.charge_currency_code.trim().toLowerCase() !== cartCurrencyCode.trim().toLowerCase()

  return currencyDiffers || entry.is_foreign_card || entry.redirect_kind !== null
}
