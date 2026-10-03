import type { MetadataRoute } from "next"
import type { TenantBranding } from "./branding"

/**
 * The PWA manifest's own content, by host (t-2026-10-03-61). Split out of `app/manifest.ts` so it
 * is testable without `next/headers`: that file reads the request (branding, shop name, default
 * locale) and hands the plain values here.
 */
export type ManifestInput = {
  branding: TenantBranding
  shopName: string
  defaultLocale: string
}

/** The W3C maskable-icon purpose, so the OS applies its own mask shape only to this one icon. */
const MASKABLE_PURPOSE = "maskable" as const

export const buildManifest = ({ branding, shopName, defaultLocale }: ManifestInput): MetadataRoute.Manifest => {
  const icons = branding.app_icons

  const manifest: MetadataRoute.Manifest = {
    name: shopName,
    short_name: branding.shop_name_short ?? shopName,
    // The owner's own default locale (`x-tenant-default-locale`), the same one the middleware
    // sends a prefix-less request to (`src/middleware.ts`) — an installed app's first screen is
    // never a redirect hop.
    start_url: `/${defaultLocale}`,
    display: "standalone",
  }

  if (branding.primary_color) {
    manifest.theme_color = branding.primary_color
    manifest.background_color = branding.primary_color
  }

  const iconList: NonNullable<MetadataRoute.Manifest["icons"]> = []

  if (icons?.icon_192_url) {
    iconList.push({ src: icons.icon_192_url, sizes: "192x192", type: "image/png" })
  }
  if (icons?.icon_512_url) {
    iconList.push({ src: icons.icon_512_url, sizes: "512x512", type: "image/png" })
  }
  if (icons?.icon_maskable_512_url) {
    iconList.push({
      src: icons.icon_maskable_512_url,
      sizes: "512x512",
      type: "image/png",
      purpose: MASKABLE_PURPOSE,
    })
  }

  // No set at all (today's single-URL favicon, or no branding whatsoever): the build's own static
  // `icon.svg` keeps the manifest from shipping with zero icons rather than naming one it does not
  // know the owner wants resized.
  manifest.icons = iconList.length > 0 ? iconList : [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }]

  return manifest
}
