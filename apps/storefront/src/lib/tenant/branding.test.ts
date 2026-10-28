import { describe, expect, it } from "vitest"

import { EMPTY_BRANDING, parseBrandingHeader, shopNameForLocale } from "./branding"

const FULL_APP_ICONS = {
  icon_svg_url: "https://cdn.example.com/icon.svg",
  favicon_ico_url: "https://cdn.example.com/favicon.ico",
  apple_touch_icon_url: "https://cdn.example.com/apple-touch-icon.png",
  icon_192_url: "https://cdn.example.com/icon-192.png",
  icon_512_url: "https://cdn.example.com/icon-512.png",
  icon_maskable_512_url: "https://cdn.example.com/icon-maskable-512.png",
  mstile_150_url: "https://cdn.example.com/mstile-150.png",
  mstile_310_url: "https://cdn.example.com/mstile-310.png",
  mask_icon_url: "https://cdn.example.com/mask-icon.svg",
  background_color: "#0a6a52",
  mark_color: "#ffffff",
}

const FULL = {
  logo_light_url: "https://cdn.example.com/logo-light.svg",
  logo_dark_url: "https://cdn.example.com/logo-dark.svg",
  favicon_url: "https://cdn.example.com/favicon.png",
  og_image_url: "https://cdn.example.com/og.png",
  primary_color: "#1a2b3c",
  primary_foreground: "#ffffff" as const,
  low_contrast: false,
  shop_name_short: "Тест",
  footer_credit: { enabled: true, text: "Создание сайта — Иван Процко", href: "https://upready.dev" },
  app_icons: FULL_APP_ICONS,
}

describe("parseBrandingHeader", () => {
  it("reads the header the middleware wrote", () => {
    expect(parseBrandingHeader(JSON.stringify(FULL))).toEqual(FULL)
  })

  it("treats an unparsable header as no branding at all", () => {
    expect(parseBrandingHeader("{not json")).toBeNull()
    expect(parseBrandingHeader(null)).toBeNull()
    expect(parseBrandingHeader(undefined)).toBeNull()
  })

  it("fills in missing fields from EMPTY_BRANDING rather than leaving them undefined", () => {
    expect(parseBrandingHeader(JSON.stringify({ primary_color: "#000000" }))).toEqual({
      ...EMPTY_BRANDING,
      primary_color: "#000000",
    })
  })

  it("defaults app_icons to null for a tenant with no icon set", () => {
    expect(parseBrandingHeader(JSON.stringify({ primary_color: "#000000" }))?.app_icons).toBeNull()
  })

  it("reads a full app_icons object through unchanged", () => {
    expect(parseBrandingHeader(JSON.stringify(FULL))?.app_icons).toEqual(FULL_APP_ICONS)
  })
})

describe("shopNameForLocale", () => {
  it("Cyrillic on Russian pages, Latin on every other (Ivan 21.10.2026)", () => {
    expect(shopNameForLocale("Cherkashino", "Черкашино", "ru")).toBe("Черкашино")
    expect(shopNameForLocale("Cherkashino", "Черкашино", "en")).toBe("Cherkashino")
    expect(shopNameForLocale("Cherkashino", "Черкашино", "de")).toBe("Cherkashino")
    expect(shopNameForLocale("Черкашино", "Cherkashino", "en")).toBe("Cherkashino")
  })

  it("keeps the short name when there is nothing to choose", () => {
    expect(shopNameForLocale(null, "Черкашино", "en")).toBeNull()
    expect(shopNameForLocale("Olavka", "Olavka shop", "ru")).toBe("Olavka")
    expect(shopNameForLocale("Cherkashino", "Черкашино", null)).toBe("Cherkashino")
  })
})
