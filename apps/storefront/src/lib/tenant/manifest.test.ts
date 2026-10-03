import { describe, expect, it } from "vitest"

import { EMPTY_BRANDING, type TenantBranding } from "./branding"
import { buildManifest } from "./manifest"

const APP_ICONS = {
  icon_svg_url: "https://cdn.example.com/icon.svg",
  favicon_ico_url: "https://cdn.example.com/favicon.ico",
  apple_touch_icon_url: "https://cdn.example.com/apple-touch-icon.png",
  icon_192_url: "https://cdn.example.com/icon-192.png",
  icon_512_url: "https://cdn.example.com/icon-512.png",
  icon_maskable_512_url: "https://cdn.example.com/icon-maskable-512.png",
  mstile_150_url: "https://cdn.example.com/mstile-150.png",
  mstile_310_url: "https://cdn.example.com/mstile-310.png",
  mask_icon_url: "https://cdn.example.com/mask-icon.svg",
}

describe("buildManifest", () => {
  it("names, locates and themes the manifest from the tenant's own branding", () => {
    const branding: TenantBranding = { ...EMPTY_BRANDING, primary_color: "#0a6a52", app_icons: APP_ICONS }

    const manifest = buildManifest({ branding, shopName: "Черкашино", defaultLocale: "ru" })

    expect(manifest.name).toBe("Черкашино")
    expect(manifest.short_name).toBe("Черкашино")
    expect(manifest.start_url).toBe("/ru")
    expect(manifest.display).toBe("standalone")
    expect(manifest.theme_color).toBe("#0a6a52")
    expect(manifest.background_color).toBe("#0a6a52")
  })

  it("prefers shop_name_short for short_name when the owner set one", () => {
    const branding: TenantBranding = { ...EMPTY_BRANDING, shop_name_short: "Черк." }

    const manifest = buildManifest({ branding, shopName: "Черкашино", defaultLocale: "ru" })

    expect(manifest.short_name).toBe("Черк.")
  })

  it("lists the 192/512/maskable icons from app_icons, in that order", () => {
    const branding: TenantBranding = { ...EMPTY_BRANDING, app_icons: APP_ICONS }

    const manifest = buildManifest({ branding, shopName: "Shop", defaultLocale: "en" })

    expect(manifest.icons).toEqual([
      { src: APP_ICONS.icon_192_url, sizes: "192x192", type: "image/png" },
      { src: APP_ICONS.icon_512_url, sizes: "512x512", type: "image/png" },
      { src: APP_ICONS.icon_maskable_512_url, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ])
  })

  it("falls back to the build's static icon.svg when the tenant has no icon set", () => {
    const manifest = buildManifest({ branding: EMPTY_BRANDING, shopName: "Shop", defaultLocale: "en" })

    expect(manifest.icons).toEqual([{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }])
    expect(manifest.theme_color).toBeUndefined()
    expect(manifest.background_color).toBeUndefined()
  })
})
