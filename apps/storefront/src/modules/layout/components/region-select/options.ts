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
 * The currency SYMBOL for a code, in the reader's own locale: "₽", "$", "€".
 * The header shows the symbol rather than the three-letter code — Ivan's wording
 * for the target state is "ru ₽" — and the flag beside it answers "which dollar".
 * The code itself stays in the dialog rows, where country and currency are named
 * in full.
 *
 * `narrowSymbol` is not in every runtime, and an unknown code throws; either way
 * the code is a correct answer, so it is the fallback rather than an error.
 */
function getCurrencySymbol(currencyCode: string, locale: string): string {
  if (!currencyCode) {
    return ""
  }

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

function getLocalizedCountryName(
  isoCode: string,
  locale: string,
  fallback: string
) {
  try {
    return (
      new Intl.DisplayNames([locale], { type: "region" }).of(
        isoCode.toUpperCase()
      ) ?? fallback
    )
  } catch {
    return fallback
  }
}

function getLocalizedLanguageName(
  code: string,
  fallback: string,
  displayLocale: string
) {
  try {
    return (
      new Intl.DisplayNames([displayLocale], { type: "language" }).of(code) ??
      fallback
    )
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
