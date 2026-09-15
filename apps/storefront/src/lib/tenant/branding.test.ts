import { describe, expect, it } from "vitest"

import { EMPTY_BRANDING, parseBrandingHeader } from "./branding"

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
})
