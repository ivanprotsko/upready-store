import type { Locale } from "@i18n/config"
import type { HttpTypes } from "@medusajs/types"

/**
 * The region switcher's rows (`./index.tsx`): the countries of the shop's
 * regions and its languages, each named in the reader's locale, and the text
 * a typed query is matched against. Apart from the component so a test can
 * hold the rows (FX5, t-2026-10-12-32).
 */

export type CountryOption = {
  country: string
  region: string
  label: string
  /** The backend's `display_name`: the name when the runtime has none, and a part of the search text. */
  displayName: string
  currencyCode: string
  currencySymbol: string
}

export type LanguageOption = {
  code: string
  label: string
  description: string
}

/**
 * One `Intl.DisplayNames` per locale and type for the life of the module
 * (FX5, t-2026-10-12-32). The search text names every country of the shop in
 * every locale, 241 × 37 names on globex, and the switcher used to build a new
 * formatter for each: 42 % of a warm page's server CPU, and the same again on
 * the buyer's phone at hydration. A locale the runtime rejects is kept as
 * `null`, and its names fall back as they always did.
 */
const displayNames = new Map<string, Intl.DisplayNames | null>()

function displayNamesOf(locale: string, type: "region" | "language") {
  const key = `${type}:${locale}`
  let names = displayNames.get(key)

  if (names === undefined) {
    try {
      names = new Intl.DisplayNames([locale], { type })
    } catch {
      names = null
    }
    displayNames.set(key, names)
  }

  return names
}

/**
 * The currency SYMBOL for a code, in the reader's own locale: "₽", "$", "€".
 * The header shows the symbol rather than the three-letter code — Ivan's wording
 * for the target state is "ru ₽" — and the flag beside it answers "which dollar".
 * The code itself stays in the dialog rows, where country and currency are named
 * in full.
 *
 * `narrowSymbol` is not in every runtime, and an unknown code throws; either way
 * the code is a correct answer, so it is the fallback rather than an error.
 */
function readCurrencySymbol(currencyCode: string, locale: string): string {
  try {
    const part = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      currencyDisplay: "narrowSymbol",
    })
      .formatToParts(0)
      .find((p) => p.type === "currency")

    return part?.value || currencyCode
  } catch {
    return currencyCode
  }
}

/**
 * Each currency's symbol in each locale, worked out once. The switcher asks
 * for it on every country row, 241 on globex, and a new `Intl.NumberFormat`
 * per row was most of what a render cost once the names were cached (FX5).
 */
const currencySymbols = new Map<string, string>()

function getCurrencySymbol(currencyCode: string, locale: string): string {
  if (!currencyCode) {
    return ""
  }

  const key = `${locale}:${currencyCode}`
  let symbol = currencySymbols.get(key)

  if (symbol === undefined) {
    symbol = readCurrencySymbol(currencyCode, locale)
    currencySymbols.set(key, symbol)
  }

  return symbol
}

function getLocalizedCountryName(
  isoCode: string,
  locale: string,
  fallback: string
) {
  try {
    return displayNamesOf(locale, "region")?.of(isoCode.toUpperCase()) ?? fallback
  } catch {
    return fallback
  }
}

/** A country's name in the reader's locale, the code itself when the runtime has none (t-2026-10-20-22). */
export function regionNameOf(isoCode: string, locale: string) {
  return getLocalizedCountryName(isoCode, locale, isoCode.toUpperCase())
}

function getLocalizedLanguageName(
  code: string,
  fallback: string,
  displayLocale: string
) {
  try {
    return displayNamesOf(displayLocale, "language")?.of(code) ?? fallback
  } catch {
    return fallback
  }
}

/** The countries of `regions`, named in `locale`, in the order of their names. */
export function countryOptionsOf(
  regions: HttpTypes.StoreRegion[],
  locale: string
): CountryOption[] {
  return regions
    .flatMap((r) =>
      (r.countries ?? []).map((c) => {
        const iso = c.iso_2 ?? ""
        const displayName = c.display_name ?? ""
        const currencyCode = r.currency_code?.toUpperCase() ?? ""

        return {
          country: iso,
          region: r.id,
          label: getLocalizedCountryName(iso, locale, displayName),
          displayName,
          currencyCode,
          currencySymbol: getCurrencySymbol(currencyCode, locale),
        }
      })
    )
    .filter((o) => o.country)
    .sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * What a query finds a country by: its name in each of the shop's locales, so
 * «Германия» finds Germany on the English page, its backend name, its code and
 * its currency.
 */
export function countrySearchText(option: CountryOption, locales: Locale[]) {
  return [
    ...locales.map((l) =>
      getLocalizedCountryName(option.country, l.code, option.displayName)
    ),
    option.displayName,
    option.country,
    option.currencyCode,
  ]
    .join(" ")
    .toLowerCase()
}

/** The shop's languages: each under its own name, described in `locale`. */
export function languageOptionsOf(
  locales: Locale[],
  locale: string,
  nativeLabel: (l: Locale) => string
): LanguageOption[] {
  return locales.map((l) => {
    const label = nativeLabel(l)

    return {
      code: l.code,
      label,
      description: getLocalizedLanguageName(l.code, label, locale),
    }
  })
}

/** What a query finds a language by: its own name, its name in each of the shop's locales, its code. */
export function languageSearchText(option: LanguageOption, locales: Locale[]) {
  return [
    option.label,
    ...locales.map((l) =>
      getLocalizedLanguageName(option.code, option.label, l.code)
    ),
    option.code,
  ]
    .join(" ")
    .toLowerCase()
}
