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
})
