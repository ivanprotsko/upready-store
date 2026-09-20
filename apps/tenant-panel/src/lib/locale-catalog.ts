/**
 * `apps/storefront/src/i18n/config.ts` `locales`/`localeLabels`, hand-transcribed
 * — same reason `apps/backend/src/api/tenants/locale-settings/validators.ts`
 * `LOCALE_CODES` is: `pnpm-workspace.yaml` lists only `apps/**`, so there is no
 * shared package the panel could import the storefront's own list from.
 */
export const LOCALE_CODES = [
  "ar",
  "bg",
  "bn",
  "cs",
  "da",
  "de",
  "el",
  "en",
  "es",
  "fi",
  "fr",
  "he",
  "hi",
  "hu",
  "id",
  "it",
  "ja",
  "ka",
  "ko",
  "lt",
  "mn",
  "ms",
  "nb",
  "nl",
  "pl",
  "pt",
  "ro",
  "ru",
  "sk",
  "sv",
  "th",
  "tl",
  "tr",
  "uk",
  "vi",
  "zh",
] as const

export type LocaleCode = (typeof LOCALE_CODES)[number]

export const LOCALE_LABELS: Record<LocaleCode, string> = {
  ar: "العربية",
  bg: "Български",
  bn: "বাংলা",
  cs: "Čeština",
  da: "Dansk",
  de: "Deutsch",
  el: "Ελληνικά",
  en: "English",
  es: "Español",
  fi: "Suomi",
  fr: "Français",
  he: "עברית",
  hi: "हिन्दी",
  hu: "Magyar",
  id: "Bahasa Indonesia",
  it: "Italiano",
  ja: "日本語",
  ka: "ქართული",
  ko: "한국어",
  lt: "Lietuvių",
  mn: "Монгол",
  ms: "Bahasa Melayu",
  nb: "Norsk bokmål",
  nl: "Nederlands",
  pl: "Polski",
  pt: "Português",
  ro: "Română",
  ru: "Русский",
  sk: "Slovenčina",
  sv: "Svenska",
  th: "ไทย",
  tl: "Tagalog",
  tr: "Türkçe",
  uk: "Українська",
  vi: "Tiếng Việt",
  zh: "中文",
}

/**
 * The country each shipped locale prices in when the shop has not picked one
 * itself (f09-price-editor-currencies). It mirrors the deployment's own
 * `LOCALE_COUNTRY_MAP` (`apps/storefront/src/middleware.ts`, shipped as
 * `ru:ru,en:us`) and extends it to the other 34 locales the obvious way: the
 * country whose Medusa region that language's shops sell in.
 *
 * Used only as a FALLBACK. The owner's own «Валюта по умолчанию» pick on
 * `/settings/locale` (`default_country`) always wins.
 */
export const LOCALE_DEFAULT_COUNTRY: Record<LocaleCode, string> = {
  ar: "ae",
  bg: "bg",
  bn: "bd",
  cs: "cz",
  da: "dk",
  de: "de",
  el: "gr",
  en: "us",
  es: "es",
  fi: "fi",
  fr: "fr",
  he: "il",
  hi: "in",
  hu: "hu",
  id: "id",
  it: "it",
  ja: "jp",
  ka: "ge",
  ko: "kr",
  lt: "lt",
  mn: "mn",
  ms: "my",
  nb: "no",
  nl: "nl",
  pl: "pl",
  pt: "pt",
  ro: "ro",
  ru: "ru",
  sk: "sk",
  sv: "se",
  th: "th",
  tl: "ph",
  tr: "tr",
  uk: "ua",
  vi: "vn",
  zh: "cn",
}

/**
 * What the panel assumes a shop's language is until it saves
 * `/settings/locale`. Same value the locale screen itself shows as its
 * unsaved default (`DEFAULT_DOCUMENT` in `routes/settings/locale/locale.tsx`)
 * and the same the deployment ships as `STOREFRONT_DEFAULT_LOCALE`.
 */
export const FALLBACK_LOCALE: LocaleCode = "ru"

export const localeOptions = LOCALE_CODES.map((code) => ({
  label: `${LOCALE_LABELS[code]} (${code})`,
  value: code,
}))
