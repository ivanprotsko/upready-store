import { describe, expect, it } from "vitest"

import { parseLocaleCountryMap } from "./locale-country"

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
