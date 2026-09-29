import { describe, expect, it } from "vitest"

import { getPathname, localeOfHref } from "./navigation"

/**
 * Internal links carry the locale themselves, so a click never goes through
 * the middleware's 302 (46df A-10).
 */
describe("internal hrefs", () => {
  it("get the locale in front of them", () => {
    expect(getPathname({ href: "/store", locale: "ru" })).toBe("/ru/store")
    expect(getPathname({ href: "/pages/privacy", locale: "en" })).toBe("/en/pages/privacy")
    expect(getPathname({ href: "/", locale: "ru" })).toBe("/ru")
    expect(getPathname({ href: "/checkout?step=address", locale: "ru" })).toBe("/ru/checkout?step=address")
  })

  it("that already name a locale are recognised, so the Link does not prefix them twice", () => {
    expect(localeOfHref("/ru/store")).toBe("ru")
    expect(localeOfHref("/en")).toBe("en")
    expect(localeOfHref("/ru?x=1")).toBe("ru")
    expect(localeOfHref("/store")).toBeNull()
    expect(localeOfHref("/russia")).toBeNull()
    expect(localeOfHref("https://olavka.com/ru")).toBeNull()
    expect(localeOfHref({ pathname: "/store" })).toBeNull()
  })
})
