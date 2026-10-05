import { describe, expect, it } from "vitest"

import { EMPTY_BRANDING, type TenantAppIcons, type TenantBranding } from "./branding"
import { resolveTenantIcon, tenantIconFileOf } from "./icon-file"

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
  background_color: "#ffffff",
  mark_color: "#1a1b09",
}

const WITH_SET: TenantBranding = { ...EMPTY_BRANDING, app_icons: APP_ICONS }
const LEGACY: TenantBranding = { ...EMPTY_BRANDING, favicon_url: "https://cdn.example.com/old.svg" }

describe("tenantIconFileOf", () => {
  it("maps the root icon paths and nothing else", () => {
    expect(tenantIconFileOf("/favicon.ico")).toBe("favicon-ico")
    expect(tenantIconFileOf("/icon.svg")).toBe("icon-svg")
    expect(tenantIconFileOf("/apple-touch-icon.png")).toBe("apple-touch-icon")
    expect(tenantIconFileOf("/apple-icon.png")).toBe("apple-touch-icon")
    expect(tenantIconFileOf("/ru/apple-icon.png")).toBeNull()
    expect(tenantIconFileOf("/ru/favicon.ico")).toBeNull()
    expect(tenantIconFileOf("/robots.txt")).toBeNull()
  })
})

describe("resolveTenantIcon", () => {
  it("sends each root path to the matching file of the tenant's set", () => {
    expect(resolveTenantIcon("favicon-ico", WITH_SET)).toEqual({ kind: "redirect", url: APP_ICONS.favicon_ico_url })
    expect(resolveTenantIcon("icon-svg", WITH_SET)).toEqual({ kind: "redirect", url: APP_ICONS.icon_svg_url })
    expect(resolveTenantIcon("apple-touch-icon", WITH_SET)).toEqual({
      kind: "redirect",
      url: APP_ICONS.apple_touch_icon_url,
    })
  })

  it("serves the old single favicon at /icon.svg only, never as .ico or the iOS icon", () => {
    expect(resolveTenantIcon("icon-svg", LEGACY)).toEqual({ kind: "redirect", url: LEGACY.favicon_url })
    expect(resolveTenantIcon("favicon-ico", LEGACY)).toEqual({ kind: "none" })
    expect(resolveTenantIcon("apple-touch-icon", LEGACY)).toEqual({ kind: "none" })
  })

  it("answers the standard placeholder at /icon.svg for a shop with nothing uploaded, and 404s the rest", () => {
    expect(resolveTenantIcon("icon-svg", EMPTY_BRANDING)).toEqual({ kind: "placeholder" })
    expect(resolveTenantIcon("favicon-ico", EMPTY_BRANDING)).toEqual({ kind: "none" })
    expect(resolveTenantIcon("apple-touch-icon", EMPTY_BRANDING)).toEqual({ kind: "none" })
    expect(resolveTenantIcon("anything-else", WITH_SET)).toEqual({ kind: "none" })
  })
})
