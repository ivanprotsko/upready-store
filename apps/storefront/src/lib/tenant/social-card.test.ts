import { describe, expect, it } from "vitest"

import {
  buildSocialImageMetadata,
  socialCardColors,
  socialCardFontSize,
  socialCardText,
  socialImageSource,
} from "./social-card"

describe("socialImageSource", () => {
  it("draws the shop's own card when the shop uploaded no picture", () => {
    expect(socialImageSource({ hasTenant: true, ogImageUrl: null })).toBe("card")
  })

  it("keeps the shop's own picture from the panel ahead of the card", () => {
    expect(socialImageSource({ hasTenant: true, ogImageUrl: "https://cdn.example.com/og.png" })).toBe("own")
  })

  it("leaves a host with no shop on the build's default file", () => {
    expect(socialImageSource({ hasTenant: false, ogImageUrl: null })).toBe("default")
  })
})

describe("buildSocialImageMetadata", () => {
  it("names both pictures after the shop", () => {
    const metadata = buildSocialImageMetadata("Лавка у реки")

    expect(metadata.openGraph).toEqual({
      images: [{ url: "/opengraph-image", alt: "Лавка у реки", type: "image/png", width: 1200, height: 630 }],
    })
    expect(metadata.twitter).toEqual({
      card: "summary_large_image",
      images: [{ url: "/twitter-image", alt: "Лавка у реки", type: "image/png", width: 1200, height: 630 }],
    })
  })

  it("carries nothing of the starter's own alt", () => {
    expect(JSON.stringify(buildSocialImageMetadata("Лавка у реки"))).not.toMatch(/Medusa|Starter|Clothing/)
  })

  it("adds no keys for a host with no shop, which keeps the file's own tags", () => {
    expect(buildSocialImageMetadata(null)).toEqual({})
    expect(buildSocialImageMetadata("  ")).toEqual({})
  })
})

describe("socialCardText", () => {
  it("draws a Russian, an English and a mixed name", () => {
    expect(socialCardText("Лавка у реки")).toBe("Лавка у реки")
    expect(socialCardText("  River Shop №1 ")).toBe("River Shop №1")
    expect(socialCardText("Мёд & Co.")).toBe("Мёд & Co.")
  })

  it("draws no text in a script the bundled face has no glyphs for", () => {
    expect(socialCardText("川の店")).toBeNull()
    expect(socialCardText("متجر النهر")).toBeNull()
    expect(socialCardText("")).toBeNull()
  })
})

describe("socialCardFontSize", () => {
  it("shrinks the type as the name grows", () => {
    expect(socialCardFontSize("Лавка")).toBe(120)
    expect(socialCardFontSize("Лавка у реки и у леса")).toBe(88)
    expect(socialCardFontSize("Очень длинное название магазина натуральных продуктов")).toBe(60)
  })
})

describe("socialCardColors", () => {
  it("uses the shop's colour with the ink the backend picked", () => {
    expect(socialCardColors({ primary_color: "#2f6f4e", primary_foreground: "#ffffff" })).toEqual({
      background: "#2f6f4e",
      color: "#ffffff",
    })
    expect(socialCardColors({ primary_color: "#f5e663", primary_foreground: "#000000" })).toEqual({
      background: "#f5e663",
      color: "#000000",
    })
  })

  it("falls back to dark ink on white for a shop with no colour", () => {
    expect(socialCardColors({ primary_color: null, primary_foreground: null })).toEqual({
      background: "#ffffff",
      color: "#18181b",
    })
  })
})
