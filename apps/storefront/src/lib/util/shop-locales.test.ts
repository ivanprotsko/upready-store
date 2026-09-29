import { describe, expect, it } from "vitest"
import { shopLocaleRedirect, shopLocales } from "./shop-locales"

const SHIPPED = ["ar", "en", "ru", "zh"] as const

describe("shopLocales", () => {
  it("keeps every shipped locale when the shop saved nothing", () => {
    expect(shopLocales(SHIPPED, null, "en")).toEqual(["ar", "en", "ru", "zh"])
    expect(shopLocales(SHIPPED, [], "en")).toEqual(["ar", "en", "ru", "zh"])
  })

  it("narrows to the shop's own list, in the build's order", () => {
    expect(shopLocales(SHIPPED, ["ru", "en"], "en")).toEqual(["en", "ru"])
  })

  it("drops a saved locale this build does not ship", () => {
    expect(shopLocales(SHIPPED, ["ru", "kk"], "en")).toEqual(["ru"])
  })

  it("falls back to one renderable locale when the shop's list ships nowhere", () => {
    expect(shopLocales(SHIPPED, ["kk", "az"], "en")).toEqual(["en"])
  })

  it("returns a copy, never the build's own array", () => {
    const out = shopLocales(SHIPPED, null, "en")
    out.push("xx" as never)
    expect(SHIPPED).toHaveLength(4)
  })
})

describe("shopLocaleRedirect", () => {
  const RU_ONLY = { defaultLocale: "ru", enabledLocales: ["ru"] }

  it("sends a language the shop does not publish to the same page in its own", () => {
    expect(shopLocaleRedirect("/en/pages/offer", RU_ONLY, SHIPPED)).toBe("/ru/pages/offer")
    expect(shopLocaleRedirect("/en", RU_ONLY, SHIPPED)).toBe("/ru")
    expect(shopLocaleRedirect("/zh/products/nastoyka-50-ml", RU_ONLY, SHIPPED)).toBe(
      "/ru/products/nastoyka-50-ml"
    )
  })

  it("leaves the shop's own languages alone", () => {
    expect(shopLocaleRedirect("/ru/pages/offer", RU_ONLY, SHIPPED)).toBeNull()
    expect(
      shopLocaleRedirect("/en/store", { defaultLocale: "ru", enabledLocales: ["ru", "en"] }, SHIPPED)
    ).toBeNull()
  })

  it("leaves a shop that saved no list, and a host with no shop, alone", () => {
    expect(shopLocaleRedirect("/en/pages/offer", null, SHIPPED)).toBeNull()
    expect(shopLocaleRedirect("/en/pages/offer", { defaultLocale: "ru", enabledLocales: [] }, SHIPPED)).toBeNull()
  })

  it("falls back to the first shipped language of the list when the default is not in it", () => {
    expect(
      shopLocaleRedirect("/ar/store", { defaultLocale: "de", enabledLocales: ["de", "ru"] }, SHIPPED)
    ).toBe("/ru/store")
    expect(shopLocaleRedirect("/ar/store", { defaultLocale: "de", enabledLocales: ["de"] }, SHIPPED)).toBeNull()
  })
})
