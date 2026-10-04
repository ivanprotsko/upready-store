import { describe, expect, it } from "vitest"

import { EMPTY_BRANDING, type TenantAppIcons, type TenantBranding } from "./branding"
import { buildIconMetadata } from "./icons"

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

describe("buildIconMetadata", () => {
  it("links every file of the set, the apple touch icon and Safari's mask-icon", () => {
    const branding: TenantBranding = { ...EMPTY_BRANDING, app_icons: APP_ICONS }

    expect(buildIconMetadata(branding).icons).toEqual({
      icon: [
        { url: APP_ICONS.favicon_ico_url, sizes: "32x32" },
        { url: APP_ICONS.icon_svg_url, type: "image/svg+xml" },
        { url: APP_ICONS.icon_192_url, sizes: "192x192", type: "image/png" },
        { url: APP_ICONS.icon_512_url, sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: APP_ICONS.apple_touch_icon_url, sizes: "180x180" }],
      other: [{ rel: "mask-icon", url: APP_ICONS.mask_icon_url, color: "#0a6a52" }],
    })
  })

  it("writes the Windows tile tags on the icon's own field colour", () => {
    const branding: TenantBranding = { ...EMPTY_BRANDING, primary_color: "#112233", app_icons: APP_ICONS }

    expect(buildIconMetadata(branding).other).toEqual({
      "msapplication-TileColor": "#0a6a52",
      "msapplication-TileImage": APP_ICONS.mstile_150_url,
      "msapplication-square150x150logo": APP_ICONS.mstile_150_url,
      "msapplication-square310x310logo": APP_ICONS.mstile_310_url,
    })
  })

  it("colours the mask-icon with the darker of field and mark for a white-field icon", () => {
    const branding: TenantBranding = {
      ...EMPTY_BRANDING,
      app_icons: { ...APP_ICONS, background_color: "#ffffff", mark_color: "#1a1b09" },
    }

    expect(buildIconMetadata(branding).icons).toMatchObject({
      other: [{ rel: "mask-icon", color: "#1a1b09" }],
    })
    expect(buildIconMetadata(branding).other).toMatchObject({ "msapplication-TileColor": "#ffffff" })
  })

  it("colours the mask-icon with the primary colour when the shop set one", () => {
    const branding: TenantBranding = { ...EMPTY_BRANDING, primary_color: "#112233", app_icons: APP_ICONS }

    expect(buildIconMetadata(branding).icons).toMatchObject({
      other: [{ rel: "mask-icon", color: "#112233" }],
    })
  })

  it("skips what a raster master does not produce", () => {
    const branding: TenantBranding = {
      ...EMPTY_BRANDING,
      app_icons: { ...APP_ICONS, icon_svg_url: null, mask_icon_url: null },
    }
    const icons = buildIconMetadata(branding).icons as { icon: unknown[]; other: unknown[] }

    expect(icons.icon).toHaveLength(3)
    expect(icons.other).toEqual([])
  })

  it("keeps the single favicon_url of an upload from before the set existed", () => {
    const url = "https://cdn.example.com/old-favicon.png"

    expect(buildIconMetadata({ ...EMPTY_BRANDING, favicon_url: url })).toEqual({
      icons: { icon: url, shortcut: url, apple: url },
    })
  })

  it("links the build's /icon.svg for a shop with no favicon", () => {
    expect(buildIconMetadata(EMPTY_BRANDING)).toEqual({
      icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }] },
    })
  })
})
