import type { HttpTypes } from "@medusajs/types"
import { afterEach, describe, expect, it, vi } from "vitest"

import { appLocales, type Locale } from "@i18n/config"

import {
  countryOptionsOf,
  countrySearchText,
  languageOptionsOf,
  languageSearchText,
  type CountryOption,
  type LanguageOption,
} from "./options"

/**
 * FX5 (t-2026-10-12-32). The switcher built a new `Intl.DisplayNames` for every
 * name it showed or searched by, 482 countries × 37 locales on globex, 42 % of
 * a warm page's server CPU. The fix keeps one formatter per locale and type,
 * and the rows, their order and what a query finds must not move: the code the
 * switcher ran before is copied below, word for word, and the rows are held
 * against it.
 */

// ---- region-select/index.tsx of dev 27a8575a: the helpers and the two memos ----
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

function getLocalizedCountryName(isoCode: string, locale: string, fallback: string) {
  try {
    return (
      new Intl.DisplayNames([locale], { type: "region" }).of(isoCode.toUpperCase()) ??
      fallback
    )
  } catch {
    return fallback
  }
}

function getLocalizedLanguageName(code: string, fallback: string, displayLocale: string) {
  try {
    return (
      new Intl.DisplayNames([displayLocale], { type: "language" }).of(code) ?? fallback
    )
  } catch {
    return fallback
  }
}

function countryOptionsBefore(
  regions: HttpTypes.StoreRegion[],
  currentLocale: string,
  locales: Locale[]
) {
  return regions
    .flatMap((r) =>
      (r.countries ?? []).map((c) => {
        const iso = c.iso_2 ?? ""
        const label = getLocalizedCountryName(iso, currentLocale, c.display_name ?? "")
        const currencyCode = r.currency_code?.toUpperCase() ?? ""
        const namesInAllLocales = locales.map((l) =>
          getLocalizedCountryName(iso, l.code, c.display_name ?? "")
        )
        const searchText = [
          ...namesInAllLocales,
          c.display_name ?? "",
          iso,
          currencyCode,
        ]
          .join(" ")
          .toLowerCase()

        return {
          country: iso,
          region: r.id,
          label,
          currencyCode,
          currencySymbol: getCurrencySymbol(currencyCode, currentLocale),
          searchText,
        }
      })
    )
    .filter((o) => o.country)
    .sort((a, b) => a.label.localeCompare(b.label))
}

function languageOptionsBefore(
  locales: Locale[],
  currentLocale: string,
  tLang: (key: string, options: { fallback: string }) => string
) {
  return locales.map((l) => {
    const nativeLabel = tLang(`locales.${l.code}`, { fallback: l.name })
    const description = getLocalizedLanguageName(l.code, nativeLabel, currentLocale)
    const namesInAllLocales = locales.map((loc) =>
      getLocalizedLanguageName(l.code, nativeLabel, loc.code)
    )
    const searchText = [nativeLabel, ...namesInAllLocales, l.code]
      .join(" ")
      .toLowerCase()

    return { code: l.code, label: nativeLabel, description, searchText }
  })
}
// ---- end of the copy ----

/** Every region code the runtime names, the way a shop that sells everywhere has them. */
const ISO =
  "ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bl bm bn bo bq br bs bt bv bw by bz ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg eh er es et fi fj fk fm fo fr ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu id ie il im in io iq ir is it je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mf mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st sv sx sy sz tc td tf tg th tj tk tl tm tn to tr tt tv tw tz ua ug um us uy uz va vc ve vg vi vn vu wf ws xk ye yt za zm zw".split(
    " "
  )

const country = (iso_2: string | undefined, display_name?: string) =>
  ({ iso_2, display_name }) as HttpTypes.StoreRegionCountry

/**
 * Four currencies over every code, a country in two regions (globex has 482
 * rows for ~250 codes), and the edges the fallbacks are for: a row with no
 * code, a code the runtime does not know, a currency code it rejects and none.
 */
const regions = [
  { id: "reg_rub", currency_code: "rub", countries: ISO.map((iso) => country(iso, `${iso.toUpperCase()} by backend`)) },
  { id: "reg_eur", currency_code: "eur", countries: ISO.slice(0, 120).map((iso) => country(iso, iso)) },
  { id: "reg_usd", currency_code: "usd", countries: [country("us"), country("aa", "Unknown land"), country("", "No code"), country(undefined)] },
  { id: "reg_bad", currency_code: "us", countries: [country("kz", "Kazakhstan")] },
  { id: "reg_none", countries: [country("de", "Germany")] },
] as HttpTypes.StoreRegion[]

/** The shop's 36 locales and one the runtime rejects, whose names must fall back. */
const locales: Locale[] = [...appLocales, { code: "not a locale!", name: "Broken" }]

const tLang = (key: string, { fallback }: { fallback: string }) =>
  key === "locales.ru" ? "Русский" : fallback

const nativeLabel = (l: Locale) => tLang(`locales.${l.code}`, { fallback: l.name })

/** A row the way the switcher held it before: its fields and its search text. */
const withSearchText = (options: CountryOption[]) =>
  options.map((o) => ({
    country: o.country,
    region: o.region,
    label: o.label,
    currencyCode: o.currencyCode,
    currencySymbol: o.currencySymbol,
    searchText: countrySearchText(o, locales),
  }))

const withLanguageSearchText = (options: LanguageOption[]) =>
  options.map((o) => ({ ...o, searchText: languageSearchText(o, locales) }))

/** The component's filter: the query, trimmed and in lower case, inside the row's search text. */
const hits = (options: { country: string; searchText: string }[], query: string) =>
  options
    .filter((o) => o.searchText.includes(query.trim().toLowerCase()))
    .map((o) => o.country)

describe("the region switcher's rows (FX5)", () => {
  it.each(["ru", "en", "de", "ar", "ja", "zh", "not a locale!"])(
    "in %s: the same countries, names, currencies, order and search text as before",
    (locale) => {
      const before = countryOptionsBefore(regions, locale, locales)
      const after = withSearchText(countryOptionsOf(regions, locale))

      expect(after).toEqual(before)
      expect(after.length).toBe(ISO.length + 120 + 4)
    }
  )

  it.each(["ru", "en", "he", "not a locale!"])(
    "in %s: the same languages, descriptions and search text as before",
    (locale) => {
      expect(withLanguageSearchText(languageOptionsOf(locales, locale, nativeLabel))).toEqual(
        languageOptionsBefore(locales, locale, tLang)
      )
    }
  )

  it("finds Germany by its name in another language, as before", () => {
    const en = withSearchText(countryOptionsOf(regions, "en"))
    const ru = withSearchText(countryOptionsOf(regions, "ru"))

    expect(en.find((o) => o.country === "de")?.label).toBe("Germany")
    expect(ru.find((o) => o.country === "de")?.label).toBe("Германия")

    for (const query of ["Германия", "  germany ", "Deutschland", "kz", "₽", "rub"]) {
      expect(hits(en, query)).toEqual(hits(countryOptionsBefore(regions, "en", locales), query))
      expect(hits(ru, query)).toEqual(hits(countryOptionsBefore(regions, "ru", locales), query))
    }

    expect(hits(en, "Германия")).toEqual(["de", "de", "de"])
    expect(hits(ru, "Germany")).toEqual(["de", "de", "de"])
    expect(hits(ru, "Казахстан")).toEqual(["kz", "kz"])
  })

  it("finds a language by its name in another language, as before", () => {
    const en = withLanguageSearchText(languageOptionsOf(locales, "en", nativeLabel))
    const found = (query: string) =>
      en.filter((o) => o.searchText.includes(query.toLowerCase())).map((o) => o.code)

    expect(found("немецкий")).toEqual(["de"])
    expect(found("German")).toEqual(["de"])
  })
})

describe("the switcher's formatters (FX5)", () => {
  const RealDisplayNames = Intl.DisplayNames
  const RealNumberFormat = Intl.NumberFormat

  afterEach(() => {
    Object.defineProperty(Intl, "DisplayNames", { value: RealDisplayNames, configurable: true, writable: true })
    Object.defineProperty(Intl, "NumberFormat", { value: RealNumberFormat, configurable: true, writable: true })
  })

  it("builds one Intl.DisplayNames per locale and type, and one currency symbol per locale and currency", async () => {
    let names = 0
    let numbers = 0
    Object.defineProperty(Intl, "DisplayNames", {
      value: class extends RealDisplayNames {
        constructor(...args: ConstructorParameters<typeof RealDisplayNames>) {
          super(...args)
          names += 1
        }
      },
      configurable: true,
      writable: true,
    })
    Object.defineProperty(Intl, "NumberFormat", {
      value: class extends RealNumberFormat {
        constructor(...args: ConstructorParameters<typeof RealNumberFormat>) {
          super(...args)
          numbers += 1
        }
      },
      configurable: true,
      writable: true,
    })

    vi.resetModules()
    const fresh = await import("./options")
    const valid = appLocales.length

    for (let render = 0; render < 3; render++) {
      for (const locale of ["ru", "en"]) {
        const countries = fresh.countryOptionsOf(regions, locale)
        countries.forEach((o) => fresh.countrySearchText(o, locales))
        fresh
          .languageOptionsOf(locales, locale, nativeLabel)
          .forEach((o) => fresh.languageSearchText(o, locales))
      }
    }

    // A region and a language formatter for each locale the runtime accepts:
    // the rejected one throws before it is counted, and is not tried again.
    expect(names).toBe(2 * valid)
    // ru and en, each with RUB, EUR, USD (the rejected "US" throws before it is counted).
    expect(numbers).toBe(2 * 3)
  })
})
