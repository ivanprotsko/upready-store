import type { HttpTypes } from "@medusajs/types"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { appLocales } from "@i18n/config"

vi.mock("next-intl", () => ({
  useLocale: () => "ru",
  useTranslations:
    () =>
    (key: string, values?: { fallback?: string }) =>
      values?.fallback ?? key,
}))
vi.mock("next/navigation", () => ({
  usePathname: () => "/ru",
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock("@lib/data/cart", () => ({ updateRegion: vi.fn() }))
vi.mock("@lib/data/locale-actions", () => ({ updateLocale: vi.fn() }))

import RegionSelect from "./index"
import CountryList from "./country-list"
import { countryOptionsOf, awayValueOf } from "./options"

/**
 * FX5 (t-2026-10-12-32). The header bar renders the switcher on every page, on
 * the server and again at hydration (the bottom nav's copy only when its menu
 * opens). It used to name every country in every locale for the search text
 * there, 241 × 37 names on globex; the search text now waits for a typed query,
 * so a render names each country once, in the reader's locale.
 */
const ISO = "am by de es fr gb it kz ru tr ua us uz".split(" ")
const regions = [
  { id: "reg_rub", currency_code: "rub", countries: ISO.map((iso_2) => ({ iso_2 })) },
  { id: "reg_eur", currency_code: "eur", countries: ISO.slice(0, 6).map((iso_2) => ({ iso_2 })) },
] as HttpTypes.StoreRegion[]

describe("a render of the region switcher (FX5)", () => {
  const realOf = Intl.DisplayNames.prototype.of

  afterEach(() => {
    Intl.DisplayNames.prototype.of = realOf
  })

  it("names each country and each language once, and shows the same header", () => {
    const asked: Record<string, number> = { region: 0, language: 0 }
    Intl.DisplayNames.prototype.of = function (this: Intl.DisplayNames, code: string) {
      asked[this.resolvedOptions().type] += 1
      return realOf.call(this, code)
    }

    const html = renderToStaticMarkup(
      <RegionSelect regions={regions} locales={appLocales} currentCountryCode="ru" variant="text" />
    )

    expect(html).toContain("Россия")
    expect(html).toContain("₽")
    expect(asked).toEqual({ region: ISO.length + 6, language: appLocales.length })
  })
})

describe("the country list on a redirect country (t-2026-10-20-22, return 1)", () => {
  it("on current ru keeps the own row, checked, beside the redirect row", () => {
    const html = renderToStaticMarkup(
      <CountryList
        value="ru"
        onValueChange={() => {}}
        redirectRows={[{ country: "ru", label: "Россия", host: "cherkashino.ru" }]}
        countryRows={countryOptionsOf(regions, "ru").filter(
          (o) => o.country === "ru" || o.country === "kz"
        )}
      />
    )
    const own = html.match(/<button[^>]*id="region-country-ru"[^>]*>/)?.[0]
    const away = html.match(/<button[^>]*id="region-away-ru"[^>]*>/)?.[0]

    expect(own).toContain('aria-checked="true"')
    expect(own).toContain('value="ru"')
    expect(away).toContain('aria-checked="false"')
    expect(away).toContain(`value="${awayValueOf("ru")}"`)
  })
})
