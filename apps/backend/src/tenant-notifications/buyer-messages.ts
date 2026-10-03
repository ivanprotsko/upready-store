/**
 * What the BUYER reads in Telegram (t-cherk-33-buyer-telegram-notifications).
 *
 * Same shape as `owner-messages.ts` and the same reason: the buyer's Telegram
 * line is not one of the 36 e-mail catalogues under `src/emails/i18n/messages`,
 * it is a short ping a shop owner never translates, so it carries its own
 * small ru/en catalogue instead of adding keys to 36 files for two lines of
 * text. The order's own locale decides which one; `ru` and `en` are the brief's
 * floor (t-cherk-33), anything else falls back to English the same way the
 * owner's message does.
 */

export const BUYER_LOCALES = ["ru", "en"] as const;
export type BuyerLocale = (typeof BUYER_LOCALES)[number];

export const FALLBACK_BUYER_LOCALE: BuyerLocale = "en";

export const resolveBuyerLocale = (
  ...candidates: Array<string | null | undefined>
): BuyerLocale => {
  for (const candidate of candidates) {
    const base = (candidate ?? "").trim().toLowerCase().split(/[-_]/)[0];
    if ((BUYER_LOCALES as readonly string[]).includes(base)) {
      return base as BuyerLocale;
    }
  }
  return FALLBACK_BUYER_LOCALE;
};

type BuyerMessages = {
  placedTitle: string;
  paidTitle: string;
  shippedTitle: string;
  total: string;
  openOrder: string;
};

export const buyerMessages: Record<BuyerLocale, BuyerMessages> = {
  ru: {
    placedTitle: "Заказ №{id} оформлен",
    paidTitle: "Заказ №{id} оплачен",
    shippedTitle: "Заказ №{id} отправлен",
    total: "Сумма",
    openOrder: "Заказ",
  },
  en: {
    placedTitle: "Order #{id} placed",
    paidTitle: "Order #{id} paid",
    shippedTitle: "Order #{id} shipped",
    total: "Total",
    openOrder: "Order",
  },
};

/** `{name}` substitution, nothing more: these strings never interpolate markup. */
export const buyerText = (
  locale: BuyerLocale,
  key: keyof BuyerMessages,
  values: Record<string, string | number> = {},
): string =>
  buyerMessages[locale][key].replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
