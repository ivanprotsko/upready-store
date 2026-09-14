export const locales = [
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

/**
 * The locale a visitor gets when nothing else decides: no locale in the URL, no
 * pick in the switcher, and either no supported language in the browser or a
 * deployment that pins the entry locale (`LOCALE_PIN`, `src/middleware.ts`).
 *
 * `NEXT_PUBLIC_DEFAULT_LOCALE` because the value is read in the browser too
 * (`routing.ts` hands it to next-intl, `buildAlternates` writes it as
 * `x-default`), so it has to be inlined at build time the way
 * `NEXT_PUBLIC_DEFAULT_REGION` already is. An unset or unknown value keeps `en`,
 * which is what every deployment before this change ran.
 */
export const defaultLocale: AppLocale = isAppLocale(
  process.env.NEXT_PUBLIC_DEFAULT_LOCALE
)
  ? (process.env.NEXT_PUBLIC_DEFAULT_LOCALE as AppLocale)
  : "en"

/**
 * Locales that win over the visitor's own ordering whenever they appear anywhere in
 * Accept-Language. upready.dev, the site every stand is linked from, is Russian-only,
 * and its visitors mostly keep English first in the browser and Russian further down
 * (measured on Ivan's Chrome 2026-09-10: `en-US,en;q=0.9,ru;q=0.8`). A visitor who
 * lists none of these gets the first language of their list the storefront ships.
 * An explicit pick in the language switcher (the choice cookie) beats both.
 */
export const preferredLocales = ["ru"] as const satisfies readonly AppLocale[]

/**
 * `_medusa_locale` is the locale of the page being served — the middleware writes it
 * on every response, and server actions without a URL (cart, customer, i18n request
 * config) read it back. `_medusa_locale_choice` is written only when the visitor picks
 * a language in the switcher; it is the one cookie the prefix-less redirect honours,
 * so landing on a shared `/en/...` link never pins English for a Russian browser.
 */
export const LOCALE_COOKIE = "_medusa_locale"
export const LOCALE_CHOICE_COOKIE = "_medusa_locale_choice"

export type AppLocale = (typeof locales)[number]

/**
 * Locales written right-to-left. Add new ones here only — every dir-aware
 * consumer (`<html dir>`, Radix roots, motion offsets) reads this.
 */
export const rtlLocales = ["ar", "he"] as const satisfies readonly AppLocale[]

export type LocaleDirection = "ltr" | "rtl"

export const getLocaleDir = (locale: string): LocaleDirection =>
  (rtlLocales as readonly string[]).includes(locale) ? "rtl" : "ltr"

export type Locale = {
  code: string
  name: string
}

export const localeLabels: Record<AppLocale, string> = {
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

export const appLocales: Locale[] = locales.map((code) => ({
  code,
  name: localeLabels[code],
}))

export function isAppLocale(
  value: string | null | undefined
): value is AppLocale {
  return !!value && locales.includes(value as AppLocale)
}

/**
 * The language tags of an Accept-Language header, lower-cased and ordered by weight
 * (highest first, header order for equal weights); `q=0` entries and `*` are dropped.
 */
export function parseAcceptLanguage(
  acceptLanguage: string | null | undefined
): string[] {
  if (!acceptLanguage) return []

  return acceptLanguage
    .split(",")
    .map((entry, index) => {
      const [tag, ...params] = entry.trim().split(";")
      const qParam = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="))
      const q = qParam ? Number(qParam.slice(2)) : 1
      return { tag: tag.trim().toLowerCase(), q: Number.isFinite(q) ? q : 0, index }
    })
    .filter(({ tag, q }) => tag && tag !== "*" && q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map(({ tag }) => tag)
}

/**
 * The storefront locale for a visitor's Accept-Language, or undefined when none of
 * their languages is one the storefront ships. Every tag is tried as written and then
 * by its language subtag (`pt-BR` → `pt`); a `preferredLocales` entry wins wherever it
 * stands in the list, otherwise the visitor's own order decides.
 */
export function matchBrowserLocale(
  acceptLanguage: string | null | undefined
): AppLocale | undefined {
  const candidates: AppLocale[] = []
  for (const tag of parseAcceptLanguage(acceptLanguage)) {
    for (const code of [tag, tag.split("-")[0]]) {
      if (isAppLocale(code) && !candidates.includes(code)) candidates.push(code)
    }
  }

  return (
    candidates.find((code) =>
      (preferredLocales as readonly string[]).includes(code)
    ) ?? candidates[0]
  )
}
