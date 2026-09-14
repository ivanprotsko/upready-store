import { describe, expect, it } from "vitest"

import { matchBrowserLocale, parseAcceptLanguage } from "./config"

describe("parseAcceptLanguage", () => {
  it("orders tags by weight, keeping header order for equal weights", () => {
    expect(parseAcceptLanguage("de;q=0.5, fr, en;q=0.8, nl;q=0.8")).toEqual([
      "fr",
      "en",
      "nl",
      "de",
    ])
  })

  it("lower-cases tags and drops q=0, wildcards and empty entries", () => {
    expect(parseAcceptLanguage("pt-BR, *;q=0.1, ,ru;q=0, EN")).toEqual([
      "pt-br",
      "en",
    ])
  })

  it("is empty for a missing header", () => {
    expect(parseAcceptLanguage(null)).toEqual([])
    expect(parseAcceptLanguage("")).toEqual([])
  })
})

describe("matchBrowserLocale", () => {
  it("follows the browser's own order when Russian is not listed", () => {
    expect(matchBrowserLocale("en-US,en;q=0.9")).toBe("en")
    expect(matchBrowserLocale("de-DE,de;q=0.9,en;q=0.8")).toBe("de")
    expect(matchBrowserLocale("fr-CH, fr;q=0.9, en;q=0.8")).toBe("fr")
  })

  it("falls through unsupported tags to the first supported one", () => {
    expect(matchBrowserLocale("sw, ga;q=0.9, nl;q=0.8")).toBe("nl")
  })

  it("matches by language subtag", () => {
    expect(matchBrowserLocale("pt-BR")).toBe("pt")
    expect(matchBrowserLocale("zh-Hant-TW")).toBe("zh")
  })

  it("picks Russian wherever it stands in the list (Ivan's Chrome, 2026-09-10)", () => {
    expect(matchBrowserLocale("en-US,en;q=0.9,ru;q=0.8")).toBe("ru")
    expect(matchBrowserLocale("de, en;q=0.9, ru;q=0.1")).toBe("ru")
    expect(matchBrowserLocale("ru-RU,ru;q=0.9,en-US;q=0.8")).toBe("ru")
  })

  it("is undefined when nothing is supported, so the caller falls back", () => {
    expect(matchBrowserLocale(undefined)).toBeUndefined()
    expect(matchBrowserLocale("sw, ga")).toBeUndefined()
    expect(matchBrowserLocale("*")).toBeUndefined()
  })
})
