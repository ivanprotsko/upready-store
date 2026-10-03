import { describe, expect, it } from "vitest"

import { EMPTY_BRANDING, type TenantAppIcons, type TenantBranding } from "./branding"
import { buildManifest } from "./manifest"

const APP_ICONS: TenantAppIcons = {
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

describe("buildManifest", () => {
  it("names, starts and themes the app from the shop that was asked", () => {
    const branding: TenantBranding = { ...EMPTY_BRANDING, app_icons: APP_ICONS }

    const manifest = buildManifest({ branding, shopName: "Черкашино", locale: "ru" })

    expect(manifest).toMatchObject({
      id: "/",
      name: "Черкашино",
      short_name: "Черкашино",
      lang: "ru",
      start_url: "/ru",
      scope: "/",
      display: "standalone",
      // No primary colour set: both come from the icon's own field.
      theme_color: "#0a6a52",
      background_color: "#0a6a52",
    })
  })

  it("puts the primary colour in the browser bar and keeps the icon field for the splash", () => {
    const branding: TenantBranding = { ...EMPTY_BRANDING, primary_color: "#112233", app_icons: APP_ICONS }

    const manifest = buildManifest({ branding, shopName: "Shop", locale: "en" })

    expect(manifest.theme_color).toBe("#112233")
    expect(manifest.background_color).toBe("#0a6a52")
  })

  it("prefers shop_name_short for short_name when the owner set one", () => {
    const branding: TenantBranding = { ...EMPTY_BRANDING, shop_name_short: "Черк." }

    expect(buildManifest({ branding, shopName: "Черкашино", locale: "ru" }).short_name).toBe("Черк.")
  })

  it("lists the 192, 512 and maskable icons of the set, in that order", () => {
    const branding: TenantBranding = { ...EMPTY_BRANDING, app_icons: APP_ICONS }

    expect(buildManifest({ branding, shopName: "Shop", locale: "en" }).icons).toEqual([
      { src: APP_ICONS.icon_192_url, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: APP_ICONS.icon_512_url, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: APP_ICONS.icon_maskable_512_url, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ])
  })

  it("falls back to the build's icon.svg and leaves the colours out when the shop has no set", () => {
    const manifest = buildManifest({ branding: EMPTY_BRANDING, shopName: "Shop", locale: "en" })

    expect(manifest.icons).toEqual([{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }])
    expect(manifest).not.toHaveProperty("theme_color")
    expect(manifest).not.toHaveProperty("background_color")
  })
})
