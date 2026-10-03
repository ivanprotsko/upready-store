import type { MetadataRoute } from "next"
import type { TenantBranding } from "./branding"

/**
 * The PWA manifest's own content, by host (t-2026-10-03-61). Split out of `app/manifest.ts` so it
 * is testable without `next/headers`: that file reads the request (branding, shop name, locale)
 * and hands the plain values here.
 */
export type ManifestInput = {
  branding: TenantBranding
  shopName: string
  /** The shop's own default locale when it saved one, else the build's `defaultLocale`. */
  locale: string
}

/** The build's own icon, for a shop with no icon set: the same file `app/icon.svg` serves. */
const BUILD_ICON: NonNullable<MetadataRoute.Manifest["icons"]>[number] = {
  src: "/icon.svg",
  sizes: "any",
  type: "image/svg+xml",
}

export const buildManifest = ({ branding, shopName, locale }: ManifestInput): MetadataRoute.Manifest => {
  const set = branding.app_icons
  // The browser bar takes the brand colour; the splash screen sits behind the icon, so it takes
  // the icon's own field. Each falls back to the other.
  const themeColor = branding.primary_color ?? set?.background_color ?? null
  const backgroundColor = set?.background_color ?? branding.primary_color ?? null

  const icons: NonNullable<MetadataRoute.Manifest["icons"]> = []

  if (set?.icon_192_url) {
    icons.push({ src: set.icon_192_url, sizes: "192x192", type: "image/png", purpose: "any" })
  }
  if (set?.icon_512_url) {
    icons.push({ src: set.icon_512_url, sizes: "512x512", type: "image/png", purpose: "any" })
  }
  if (set?.icon_maskable_512_url) {
    icons.push({ src: set.icon_maskable_512_url, sizes: "512x512", type: "image/png", purpose: "maskable" })
  }

  return {
    // A stable id, so the installed app stays the same app whichever locale `start_url` names.
    id: "/",
    name: shopName,
    short_name: branding.shop_name_short ?? shopName,
    lang: locale,
    // The locale prefix up front: the middleware redirects a bare `/`, and an installed app
    // should not open on a redirect.
    start_url: `/${locale}`,
    scope: "/",
    display: "standalone",
    ...(themeColor ? { theme_color: themeColor } : {}),
    ...(backgroundColor ? { background_color: backgroundColor } : {}),
    icons: icons.length ? icons : [BUILD_ICON],
  }
}
