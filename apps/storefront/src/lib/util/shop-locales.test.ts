import { describe, expect, it } from "vitest"
import { shopLocales } from "./shop-locales"

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
