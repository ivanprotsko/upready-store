/**
 * Names, buyer-facing copy and starting price of the two delivery methods a
 * new tenant is provisioned with, in the store's default locale. Before this
 * the workflow minted `<Shop> pickup` and `<Shop> courier`, which reached the
 * customer's checkout as written («Оксана Черкашина courier · 10,00 ₽»,
 * measured on cherkashino.shipshift.dev 2026-09-15).
 *
 * Only the locales the panel and the emails already ship (ru, en) have a
 * dedicated entry; anything else falls back to English. The owner renames,
 * reprices and describes them on `/shipping` in the panel the moment she wants
 * something else.
 */
export type DefaultMethodNames = {
  pickup: { name: string; description: string; delivery_hint: string | null };
  courier: { name: string; description: string; delivery_hint: string | null };
};

const NAMES: Record<string, DefaultMethodNames> = {
  ru: {
    pickup: {
      name: "Самовывоз",
      description: "Заберите заказ у продавца.",
      delivery_hint: "Адрес и время пришлём после заказа",
    },
    courier: {
      name: "Курьером",
      description: "До двери. Стоимость подтвердит магазин.",
      delivery_hint: null,
    },
  },
  en: {
    pickup: {
      name: "Pickup",
      description: "Collect the order from the seller.",
      delivery_hint: "We send the address after checkout",
    },
    courier: {
      name: "Courier",
      description: "To your door. The shop confirms the cost.",
      delivery_hint: null,
    },
  },
};

export const defaultMethodNames = (locale?: string | null): DefaultMethodNames => {
  const language = (locale ?? "").toLowerCase().split(/[-_]/)[0];
  return NAMES[language] ?? NAMES.en;
};

/** The store's default locale as the backend knows it (`STOREFRONT_DEFAULT_LOCALE`, the same variable the emails read). */
export const storeDefaultLocale = (): string => process.env.STOREFRONT_DEFAULT_LOCALE || "en";

/** The country a store in this locale ships from, so «the shop's currency» is the currency of that country's region. */
export const HOME_COUNTRY_BY_LOCALE: Record<string, string> = {
  ru: "ru",
  en: "us",
  de: "de",
  fr: "fr",
  es: "es",
  it: "it",
  pl: "pl",
  tr: "tr",
  uk: "ua",
  kk: "kz",
  be: "by",
};

export const homeCountryForLocale = (locale?: string | null): string =>
  HOME_COUNTRY_BY_LOCALE[(locale ?? "").toLowerCase().split(/[-_]/)[0]] ?? "us";

/**
 * Starting courier price per currency, the number the owner is expected to
 * replace on /shipping. It is a default, not a quote: the method's description
 * tells the buyer the shop confirms the exact cost, and the panel marks the
 * method «Тариф по умолчанию» until the owner saves her own
 * (`tariff_source` in `tariff.ts`).
 *
 * `rub` is 300 because the one measured reference for this customer's own
 * courier is СДЭК, 185 ₽ and 325 ₽ on a live sandbox quote 2026-09-01
 * (`chrxnasdmds` project digest, «Доставка»). The 10 every other currency
 * keeps is the workflow's original placeholder, left alone on purpose: 10 USD
 * or 10 EUR is a plausible parcel price, 10 ₽ is not.
 */
const COURIER_AMOUNT_BY_CURRENCY: Record<string, number> = { rub: 300 };
const COURIER_AMOUNT_FALLBACK = 10;

export const defaultCourierAmount = (currencyCode?: string | null): number =>
  COURIER_AMOUNT_BY_CURRENCY[(currencyCode ?? "").toLowerCase()] ?? COURIER_AMOUNT_FALLBACK;

/** The price the first cut of the provisioning workflow wrote for every currency, in every store. */
export const LEGACY_COURIER_AMOUNT = 10;

/** Matches the machine-made names the first cut of the provisioning workflow wrote, for the rename script. */
export const isMachineMadeDefaultName = (name: string, tenantName: string): "pickup" | "courier" | null => {
  if (name === `${tenantName} pickup`) return "pickup";
  if (name === `${tenantName} courier`) return "courier";
  return null;
};
