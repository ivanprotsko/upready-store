import { describe, expect, it } from "vitest"

import { parseIcon } from "./icon-name"
import { pickText } from "./localized-text"
import {
  parseBoolean,
  parseEnum,
  parseHref,
  parseInteger,
  parseList,
  parseLocalizedText,
  parseObject,
  parseProps,
} from "./parse"
import { SEE_ALL_LABEL, parseSectionHeader } from "./section-header"

const errorsOf = (result: { ok: boolean; errors?: string[] }) => (result.ok ? [] : (result.errors ?? []))

describe("pickText", () => {
  it("is the visitor's language, then English, then any, trimmed", () => {
    expect(pickText({ ru: " Привет ", en: "Hi" }, "ru")).toBe("Привет")
    expect(pickText({ ru: "Привет", en: "Hi" }, "de")).toBe("Hi")
    expect(pickText({ uk: "Привіт" }, "de")).toBe("Привіт")
  })

  it("is null for nothing to say", () => {
    expect(pickText({}, "ru")).toBeNull()
    expect(pickText({ ru: "   " }, "ru")).toBeNull()
    expect(pickText(null, "ru")).toBeNull()
  })
})

describe("parseLocalizedText", () => {
  it("takes language codes of i18n/config.ts and strings up to max", () => {
    expect(parseLocalizedText({ ru: "Да", en: "Yes" }, "label", { max: 10 })).toEqual({
      ok: true,
      value: { ru: "Да", en: "Yes" },
    })
  })

  it("names every fault under its path", () => {
    expect(errorsOf(parseLocalizedText({ xx: "?", en: 3, ru: "долго" }, "items[1].title", { max: 3 }))).toEqual([
      "items[1].title.xx: not a language of i18n/config.ts",
      "items[1].title.en must be a string",
      "items[1].title.ru is 5 characters, at most 3",
    ])
    expect(errorsOf(parseLocalizedText("Да", "label", { max: 10 }))).toEqual([
      "label must be an object of language code to string",
    ])
  })

  it("answers the block's default when absent, and requires the text without one", () => {
    expect(parseLocalizedText(undefined, "label", { max: 30, fallback: SEE_ALL_LABEL })).toEqual({
      ok: true,
      value: SEE_ALL_LABEL,
    })
    expect(errorsOf(parseLocalizedText(undefined, "text", { max: 30 }))).toEqual([
      "text must be an object of language code to string",
    ])
  })
})

describe("parseHref", () => {
  it("takes a path inside the shop or an https address; absent is null", () => {
    expect(parseHref("/store?sort=new", "href")).toEqual({ ok: true, value: "/store?sort=new" })
    expect(parseHref("https://t.me/shop", "href")).toEqual({ ok: true, value: "https://t.me/shop" })
    expect(parseHref(undefined, "href")).toEqual({ ok: true, value: null })
  })

  it("refuses other schemes, other sites dressed as paths, spaces, and absence when required", () => {
    expect(errorsOf(parseHref("javascript:0", "href"))).toEqual(["href must start with / or https://"])
    expect(errorsOf(parseHref("http://shop.ru", "href"))).toEqual(["href must start with / or https://"])
    expect(errorsOf(parseHref("//evil.test", "href"))).toEqual(["href: // leads to another site; write https://"])
    expect(errorsOf(parseHref("/\\evil.test", "href"))).toHaveLength(1)
    expect(errorsOf(parseHref("/a b", "href"))).toHaveLength(1)
    expect(errorsOf(parseHref(null, "cta.href", { required: true }))).toEqual(["cta.href is required"])
  })
})

describe("parseEnum, parseInteger, parseBoolean, parseIcon", () => {
  it("parseEnum takes a listed value, the fallback when absent", () => {
    expect(parseEnum("right", "align", ["left", "right"] as const)).toEqual({ ok: true, value: "right" })
    expect(parseEnum(undefined, "align", ["left", "right"] as const, { fallback: "left" })).toEqual({
      ok: true,
      value: "left",
    })
    expect(errorsOf(parseEnum("up", "align", ["left", "right"] as const))).toEqual(["align must be one of: left, right"])
  })

  it("parseInteger takes whole numbers in range", () => {
    expect(parseInteger(3, "columns", { min: 2, max: 4 })).toEqual({ ok: true, value: 3 })
    expect(parseInteger(undefined, "columns", { min: 2, max: 4, fallback: 3 })).toEqual({ ok: true, value: 3 })
    for (const bad of [1, 5, 2.5, "3", undefined]) {
      expect(errorsOf(parseInteger(bad, "columns", { min: 2, max: 4 }))).toEqual([
        "columns must be a whole number from 2 to 4",
      ])
    }
  })

  it("parseBoolean takes true and false", () => {
    expect(parseBoolean(undefined, "autoplay", { fallback: true })).toEqual({ ok: true, value: true })
    expect(errorsOf(parseBoolean("yes", "autoplay", { fallback: true }))).toEqual(["autoplay must be true or false"])
  })

  it("parseIcon takes a name of the allow-list and nothing else", () => {
    expect(parseIcon("truck", "icon")).toEqual({ ok: true, value: "truck" })
    expect(parseIcon(undefined, "icon", { fallback: "star" })).toEqual({ ok: true, value: "star" })
    expect(errorsOf(parseIcon("rocket", "items[0].icon"))[0]).toMatch(/^items\[0\]\.icon must be an icon of/)
  })
})

describe("parseObject, parseList, parseProps", () => {
  type Item = { title: Record<string, string>; href: string | null }
  const item = (value: unknown, path: string) =>
    parseObject<Item>(value, path, {
      title: (v, p) => parseLocalizedText(v, p, { max: 20 }),
      href: (v, p) => parseHref(v, p),
    })

  it("reads a list of objects, every error under its index", () => {
    const result = parseList([{ title: { ru: "Да" } }, { title: { ru: "Нет" }, href: "ftp://x", size: 1 }], "items", item, {
      max: 3,
    })
    expect(errorsOf(result)).toEqual([
      "items[1].href must start with / or https://",
      "items[1].size: not a field of items[1]",
    ])
  })

  it("bounds the list and answers the fallback when absent", () => {
    expect(errorsOf(parseList([1, 2, 3], "items", (v) => ({ ok: true, value: v }), { min: 1, max: 2 }))).toEqual([
      "items has 3 items, at most 2",
    ])
    expect(errorsOf(parseList([], "items", (v) => ({ ok: true, value: v }), { min: 1, max: 2 }))).toEqual([
      "items has 0 items, at least 1",
    ])
    expect(parseList(undefined, "items", item, { max: 2, fallback: [] })).toEqual({ ok: true, value: [] })
    expect(errorsOf(parseList({}, "items", item, { max: 2 }))).toEqual(["items must be a list"])
  })

  it("parseProps reads absent props as {}, names strangers by the block", () => {
    const fields = {
      align: (v: unknown, p: string) => parseEnum(v, p, ["left", "center"] as const, { fallback: "left" }),
    }
    expect(parseProps(undefined, "text/rich", fields)).toEqual({ ok: true, value: { align: "left" } })
    expect(errorsOf(parseProps({ colour: "red" }, "text/rich", fields))).toEqual(["colour: not a prop of text/rich"])
    expect(errorsOf(parseProps([], "text/rich", fields))).toEqual(["props must be an object { align }"])
  })
})

describe("parseSectionHeader", () => {
  it("is null when absent, and fills what is not given", () => {
    expect(parseSectionHeader(undefined, "header")).toEqual({ ok: true, value: null })
    expect(parseSectionHeader({ heading: { ru: "Новинки" }, seeAll: { href: "/store" } }, "header")).toEqual({
      ok: true,
      value: {
        eyebrow: {},
        heading: { ru: "Новинки" },
        description: {},
        seeAll: { href: "/store", label: SEE_ALL_LABEL },
      },
    })
  })

  it("requires the see-all link's address and keeps every limit", () => {
    expect(errorsOf(parseSectionHeader({ seeAll: {}, eyebrow: { ru: "x".repeat(41) } }, "header"))).toEqual([
      "header.eyebrow.ru is 41 characters, at most 40",
      "header.seeAll.href is required",
    ])
  })
})
