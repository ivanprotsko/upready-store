import { InitOptions } from "i18next"

export const defaultI18nOptions: InitOptions = {
  debug: process.env.NODE_ENV === "development",
  detection: {
    caches: ["cookie", "localStorage", "header"],
    lookupCookie: "lng",
    lookupLocalStorage: "lng",
    order: ["cookie", "localStorage", "header"],
  },
  // Русский: панель открывает владелец магазина, пришедший с русского
  // лендинга upready.dev. Английский остаётся — его выберет определение по
  // заголовку браузера или переключатель языка.
  fallbackLng: "ru",
  fallbackNS: "translation",
  interpolation: {
    escapeValue: false,
  },
}
