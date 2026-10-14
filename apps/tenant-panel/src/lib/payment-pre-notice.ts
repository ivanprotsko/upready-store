import type { TFunction } from "i18next"

/**
 * Предупреждение перед оплатой (rule 5zd, t-2026-10-03-32): показывается,
 * когда валюта списания отличается от валюты корзины, способ — иностранная
 * карта, или оплату принимает другое лицо/домен. Plain TS, no JSX, so this
 * is imported and run for real in its own test (same note as
 * `payment-methods-summary.ts`).
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

/**
 * The cart the panel's preview assumes (t-2026-10-14-01, G3): the shop sells
 * in roubles, so the card and the drawer say what a buyer with a rouble cart
 * reads, and say so («корзина в рублях»), instead of asking for a currency.
 */
export const PREVIEW_CART_CURRENCY = "rub"

type Translate = TFunction<"translation">

/**
 * The sentences the buyer reads under the shop's own first line, in the
 * storefront's order (`checkout/components/payment-pre-notice`): where paying
 * leads, what currency is charged at what rate, how to get the money back.
 * `null` when a rouble cart sees no notice at all; `""` when the notice shows
 * but carries none of the three (a foreign card and nothing else).
 */
export const prePaymentNoticeText = (entry: PaymentPreNoticeEntry, t: Translate): string | null => {
  if (!shouldShowPrePaymentNotice(entry, PREVIEW_CART_CURRENCY)) {
    return null
  }
  const value = entry.redirect_value?.trim()
  const currency = entry.charge_currency_code?.trim()
  const rateSource = entry.rate_source?.trim()
  const refund = entry.refund_terms?.trim()

  return [
    entry.redirect_kind
      ? t(`paymentPreNotice.preview.redirect.${entry.redirect_kind}`, {
          value: value || t("paymentPreNotice.previewValuePlaceholder"),
        })
      : null,
    currency
      ? rateSource
        ? t("paymentPreNotice.preview.chargeWithSource", { currency: currency.toUpperCase(), rateSource })
        : t("paymentPreNotice.preview.chargeNoSource", { currency: currency.toUpperCase() })
      : null,
    refund ? t("paymentPreNotice.preview.refund", { terms: refund }) : null,
  ]
    .filter(Boolean)
    .join(" ")
}

/**
 * When the buyer meets the notice: `always` for a redirect or a foreign card,
 * `currency` only for a cart not in the charge currency, `never` when nothing
 * is set.
 */
export const prePaymentNoticeShownWhen = (entry: PaymentPreNoticeEntry): "always" | "currency" | "never" =>
  entry.redirect_kind !== null || entry.is_foreign_card
    ? "always"
    : entry.charge_currency_code?.trim()
      ? "currency"
      : "never"
