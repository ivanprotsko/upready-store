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

  describe("options.allowed (t06-locale-currency: a tenant's enabled_locales)", () => {
    it("never lands on a locale outside the allowed set", () => {
      expect(
        matchBrowserLocale("de-DE,de;q=0.9,en;q=0.8", { allowed: ["ru", "en"] })
      ).toBe("en")
    })

    it("is undefined when none of the browser's languages is allowed", () => {
      expect(
        matchBrowserLocale("de-DE,de;q=0.9,fr;q=0.8", { allowed: ["ru", "en"] })
      ).toBeUndefined()
    })

    it("still matches by language subtag inside the allowed set", () => {
      expect(matchBrowserLocale("pt-BR", { allowed: ["ru", "en", "pt"] })).toBe(
        "pt"
      )
    })
  })

  describe("options.preferred (a tenant's own default_locale)", () => {
    it("overrides the deployment's preferredLocales for this call", () => {
      expect(
        matchBrowserLocale("en-US,en;q=0.9,de;q=0.8", { preferred: ["de"] })
      ).toBe("de")
    })

    it("combines with allowed: the preferred locale still has to be allowed", () => {
      expect(
        matchBrowserLocale("en-US,en;q=0.9,de;q=0.8", {
          allowed: ["en", "de"],
          preferred: ["ru"],
        })
      ).toBe("en")
    })
  })
})
