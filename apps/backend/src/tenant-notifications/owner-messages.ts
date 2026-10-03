/**
 * What the SHOP OWNER reads (t08-order-notifications).
 *
 * These strings are not the customer's. The 36 e-mail catalogues under
 * `src/emails/i18n/messages` are written for the buyer and translated 36 times;
 * the owner's Telegram message is read in the same two languages the owner's
 * panel speaks (`apps/tenant-panel/src/i18n/translations`), so it carries its
 * own small catalogue rather than adding a dozen keys to 36 files nobody asked
 * to grow.
 *
 * The language follows the shop's own default (`STOREFRONT_DEFAULT_LOCALE`,
 * `ru` on this deployment); anything the panel does not speak reads English.
 */

export const OWNER_LOCALES = ["ru", "en"] as const;
export type OwnerLocale = (typeof OWNER_LOCALES)[number];

export const FALLBACK_OWNER_LOCALE: OwnerLocale = "en";

export const resolveOwnerLocale = (
  ...candidates: Array<string | null | undefined>
): OwnerLocale => {
  for (const candidate of candidates) {
    const base = (candidate ?? "").trim().toLowerCase().split(/[-_]/)[0];
    if ((OWNER_LOCALES as readonly string[]).includes(base)) {
      return base as OwnerLocale;
    }
  }
  return FALLBACK_OWNER_LOCALE;
};

/** The shop's default language, as the deployment configured it. */
export const defaultOwnerLocale = (env: NodeJS.ProcessEnv = process.env): OwnerLocale =>
  resolveOwnerLocale(env.STOREFRONT_DEFAULT_LOCALE);

type OwnerMessages = {
  newOrder: string;
  shop: string;
  items: string;
  shipping: string;
  total: string;
  customer: string;
  phone: string;
  email: string;
  delivery: string;
  address: string;
  comment: string;
  openInPanel: string;
  quantityShort: string;
  linked: string;
  linkedHint: string;
  linkUnknown: string;
  linkExpired: string;
  testTitle: string;
  testBody: string;
  receiptTitle: string;
  receiptBody: string;
};

export const ownerMessages: Record<OwnerLocale, OwnerMessages> = {
  ru: {
    newOrder: "Новый заказ №{id}",
    shop: "Магазин",
    items: "Состав заказа",
    shipping: "Доставка",
    total: "Итого",
    customer: "Покупатель",
    phone: "Телефон",
    email: "Почта",
    delivery: "Способ доставки",
    address: "Адрес",
    comment: "Комментарий",
    openInPanel: "Открыть заказ в панели",
    quantityShort: "шт",
    linked: "Готово: заказы магазина «{shop}» будут приходить сюда.",
    linkedHint: "Чтобы отключить уведомления, откройте в панели «Уведомления» и нажмите «Отключить».",
    linkUnknown: "Код не найден. Откройте в панели «Уведомления» и получите новый код.",
    linkExpired: "Код устарел: он живёт 15 минут. Получите новый в панели, раздел «Уведомления».",
    testTitle: "Проверка связи",
    testBody: "Это тестовое сообщение магазина «{shop}». Уведомления о заказах будут приходить сюда.",
    receiptTitle: "Покупатель оплатил заказ №{id} и прислал чек",
    receiptBody: "Чек: {url}\nПроверьте поступление и подтвердите оплату в панели.",
  },
  en: {
    newOrder: "New order #{id}",
    shop: "Shop",
    items: "Items",
    shipping: "Shipping",
    total: "Total",
    customer: "Customer",
    phone: "Phone",
    email: "E-mail",
    delivery: "Delivery method",
    address: "Address",
    comment: "Comment",
    openInPanel: "Open the order in the panel",
    quantityShort: "pcs",
    linked: "Done: orders of «{shop}» will arrive here.",
    linkedHint: "To stop them, open Notifications in the panel and press Disconnect.",
    linkUnknown: "This code is unknown. Open Notifications in the panel and get a new one.",
    linkExpired: "This code has expired: a code lives 15 minutes. Get a new one in the panel, Notifications.",
    testTitle: "Connection test",
    testBody: "This is a test message from «{shop}». Order notifications will arrive here.",
    receiptTitle: "The customer paid order #{id} and sent a receipt",
    receiptBody: "Receipt: {url}\nCheck that the money arrived and confirm the payment in the panel.",
  },
};

/** `{name}` substitution, nothing more: these strings never interpolate markup. */
export const ownerText = (
  locale: OwnerLocale,
  key: keyof OwnerMessages,
  values: Record<string, string | number> = {},
): string =>
  ownerMessages[locale][key].replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
