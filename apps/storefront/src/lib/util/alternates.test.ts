import { describe, expect, it } from "vitest"
import { buildAlternatesFor } from "./alternates-core"
import { locales, defaultLocale } from "@i18n/config"

describe("buildAlternatesFor", () => {
  it("lists every shipped locale when no shop list is given", () => {
    const { languages } = buildAlternatesFor("https://shop.example", "ru", "/products/x")

    expect(Object.keys(languages)).toHaveLength(locales.length + 1)
    expect(languages["x-default"]).toBe(`https://shop.example/${defaultLocale}/products/x`)
  })

  it("lists only the shop's own languages", () => {
    const { canonical, languages } = buildAlternatesFor(
      "https://shop.example",
      "ru",
      "/products/x",
      ["ru", "en"]
    )

    expect(canonical).toBe("https://shop.example/ru/products/x")
    expect(Object.keys(languages).sort()).toEqual(["en", "ru", "x-default"])
    expect(languages.ru).toBe("https://shop.example/ru/products/x")
  })

  it("points x-default at a language the shop actually publishes", () => {
    const { languages } = buildAlternatesFor("https://shop.example", "ru", "/", ["ru"])

    expect(languages["x-default"]).toBe("https://shop.example/ru")
    expect(languages.ru).toBe("https://shop.example/ru")
  })

  it("adds a sister's hreflang for a language this shop does not publish, and points x-default at it", () => {
    const { canonical, languages } = buildAlternatesFor(
      "https://cherkashino.ru",
      "ru",
      "/products/x",
      ["ru"],
      [{ origin: "https://cherkashino.com", locale: "en" }]
    )

    expect(canonical).toBe("https://cherkashino.ru/ru/products/x")
    expect(languages.ru).toBe("https://cherkashino.ru/ru/products/x")
    expect(languages.en).toBe("https://cherkashino.com/en/products/x")
    expect(languages["x-default"]).toBe("https://cherkashino.com/en/products/x")
  })

  it("keeps a shop's own page when it already publishes the sister's language", () => {
    const { languages } = buildAlternatesFor(
      "https://cherkashino.com",
      "en",
      "/products/x",
      ["en", "ru"],
      [{ origin: "https://cherkashino.ru", locale: "en" }]
    )

    expect(languages.en).toBe("https://cherkashino.com/en/products/x")
    expect(languages["x-default"]).toBe("https://cherkashino.com/en/products/x")
  })

  it("is byte-identical to no sisters when the shop has none", () => {
    const withEmptySisters = buildAlternatesFor("https://shop.example", "ru", "/products/x", ["ru", "en"], [])
    const withNoSistersArg = buildAlternatesFor("https://shop.example", "ru", "/products/x", ["ru", "en"])

    expect(withEmptySisters).toEqual(withNoSistersArg)
  })

  it("builds a sister's root-path hreflang with no trailing slash", () => {
    const { languages } = buildAlternatesFor(
      "https://cherkashino.ru",
      "ru",
      "/",
      ["ru"],
      [{ origin: "https://cherkashino.com", locale: "en" }]
    )

    expect(languages.en).toBe("https://cherkashino.com/en")
  })
})
