import { describe, expect, it } from "vitest"

import { countryForLocale, parseLocaleCountryMap } from "./locale-country"

describe("parseLocaleCountryMap", () => {
  it("reads the deployment's pairs", () => {
    expect(Array.from(parseLocaleCountryMap("ru:ru,en:us"))).toEqual([
      ["ru", "ru"],
      ["en", "us"],
    ])
  })

  it("lower-cases and trims, so RU : US reads the same as ru:us", () => {
    expect(Array.from(parseLocaleCountryMap(" RU : US , En:De "))).toEqual([
      ["ru", "us"],
      ["en", "de"],
    ])
  })

  it("is empty for an unset variable, which is every deployment that maps none", () => {
    expect(parseLocaleCountryMap("").size).toBe(0)
  })

  it("drops half-written pairs instead of throwing on them", () => {
    expect(Array.from(parseLocaleCountryMap("ru:,:us,,de:de"))).toEqual([["de", "de"]])
  })
})

describe("countryForLocale (t06-locale-currency: a tenant's own default_country)", () => {
  it("prefers the override over the deployment's own map", () => {
    const override = new Map([["ru", "kz"]])
    expect(countryForLocale("ru", override)).toBe("kz")
  })

  it("is case-insensitive on the locale key", () => {
    const override = new Map([["ru", "kz"]])
    expect(countryForLocale("RU", override)).toBe("kz")
  })

  it("falls through to null when neither the override nor the deployment map names one", () => {
    expect(countryForLocale("fr", new Map([["ru", "kz"]]))).toBeNull()
    expect(countryForLocale("fr", null)).toBeNull()
  })

  it("is null for a missing locale regardless of the override", () => {
    expect(countryForLocale(null, new Map([["ru", "kz"]]))).toBeNull()
  })
})
