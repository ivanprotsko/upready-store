import { describe, expect, it } from "vitest"

import { parseLocaleCountryMap } from "./locale-country"
import { narrowRegionMap, narrowRegions, shopRegionIds } from "./shop-regions"

/**
 * N9 (t-2026-10-04-19): the switcher of cherkashino.ru offered every country
 * the backend has a region for. These cases are the two live shops and the
 * edges of the chain `shopRegionIds` walks.
 */
const russia = { id: "reg_ru", currency_code: "rub" }
const usa = { id: "reg_us", currency_code: "usd" }
const germany = { id: "reg_de", currency_code: "eur" }
const international = { id: "reg_intl", currency_code: "usd" }

// One region per country, the way every deployment is seeded.
const regionMap = new Map([
  ["ru", russia],
  ["us", usa],
  ["de", germany],
])

const ALL_LOCALES = ["ar", "de", "en", "ru", "zh"]

const chain = (deployment: string, tenant?: [string, string]) => {
  const map = parseLocaleCountryMap(deployment)
  const override = tenant ? new Map([tenant]) : null

  return (locale: string) => override?.get(locale) ?? map.get(locale) ?? null
}

const ids = (set: Set<string> | null) => (set ? Array.from(set).sort() : null)

describe("shopRegionIds", () => {
  it("keeps one region for cherkashino.ru: no locale settings, every locale, ru:ru, pinned ru", () => {
    expect(
      ids(
        shopRegionIds({
          locales: ALL_LOCALES,
          countryFor: chain("ru:ru"),
          fallbackCountry: "ru",
          regionMap,
        })
      )
    ).toEqual(["reg_ru"])
  })

  it("keeps the dollar alone on cherkashino.com: en priced in us by the shop, ru left to the pin", () => {
    expect(
      ids(
        shopRegionIds({
          locales: ["en", "ru"],
          countryFor: chain("", ["en", "us"]),
          fallbackCountry: "us",
          regionMap,
        })
      )
    ).toEqual(["reg_us"])
  })

  it("keeps both regions on cherkashino.com when its two languages price in two countries", () => {
    expect(
      ids(
        shopRegionIds({
          locales: ["en", "ru"],
          countryFor: chain("ru:ru,en:us", ["en", "us"]),
          fallbackCountry: "us",
          regionMap,
        })
      )
    ).toEqual(["reg_ru", "reg_us"])
  })

  it("lets the shop's own default country outrank the deployment map", () => {
    expect(
      ids(
        shopRegionIds({
          locales: ["ru"],
          countryFor: chain("ru:ru", ["ru", "de"]),
          fallbackCountry: "ru",
          regionMap,
        })
      )
    ).toEqual(["reg_de"])
  })

  it("falls back to the pinned country for a mapped country the backend has no region for", () => {
    expect(
      ids(
        shopRegionIds({
          locales: ["ru"],
          countryFor: chain("ru:by"),
          fallbackCountry: "ru",
          regionMap,
        })
      )
    ).toEqual(["reg_ru"])
  })

  it("narrows nothing when a locale is left to detection", () => {
    expect(
      shopRegionIds({
        locales: ["en", "ru"],
        countryFor: chain("ru:ru"),
        fallbackCountry: null,
        regionMap,
      })
    ).toBeNull()
  })

  it("narrows nothing when the pinned country has no region either", () => {
    expect(
      shopRegionIds({
        locales: ["en"],
        countryFor: chain(""),
        fallbackCountry: "fr",
        regionMap,
      })
    ).toBeNull()
  })

  it("narrows nothing without locales or regions", () => {
    const args = { countryFor: chain("ru:ru"), fallbackCountry: "ru" }

    expect(shopRegionIds({ ...args, locales: [], regionMap })).toBeNull()
    expect(shopRegionIds({ ...args, locales: ["ru"], regionMap: new Map() })).toBeNull()
  })
})

describe("narrowRegionMap", () => {
  it("drops every country outside the shop's regions, so a cookie naming one resolves to the default", () => {
    const narrowed = narrowRegionMap(regionMap, new Set(["reg_ru"]))

    expect(Array.from(narrowed.keys())).toEqual(["ru"])
  })

  it("keeps every country of a kept region", () => {
    const shared = new Map([
      ["us", international],
      ["de", international],
      ["ru", russia],
    ])

    expect(Array.from(narrowRegionMap(shared, new Set(["reg_intl"])).keys())).toEqual([
      "us",
      "de",
    ])
  })

  it("returns the map itself when nothing narrows it", () => {
    expect(narrowRegionMap(regionMap, null)).toBe(regionMap)
  })
})

describe("narrowRegions", () => {
  it("keeps the shop's regions in the backend's order", () => {
    expect(narrowRegions([germany, russia, usa], ["reg_us", "reg_ru"])).toEqual([russia, usa])
  })

  it("keeps every region when nothing narrows them", () => {
    const regions = [germany, russia]

    expect(narrowRegions(regions, null)).toBe(regions)
  })
})
