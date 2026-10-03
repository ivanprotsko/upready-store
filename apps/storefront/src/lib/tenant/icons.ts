import type { Metadata } from "next"
import type { TenantBranding } from "./branding"

/**
 * The tenant's icon `<link>`s and Windows tile `<meta>`s (t-2026-10-03-61), the part of
 * `app/layout.tsx`'s `generateMetadata` that depends on branding alone. Split out so it is
 * testable without a request.
 *
 * Three cases:
 * - an icon set (`branding.app_icons`, built by the backend from the favicon upload): one link
 *   per file, plus the Safari pinned-tab `mask-icon` and the Windows tile tags;
 * - only the single `favicon_url` of an upload from before the set existed: that URL for
 *   `icon`, `shortcut` and `apple`, exactly as t16-owner-branding wrote it;
 * - nothing: no `icons` at all, so Next keeps the build's own `app/icon.svg` (a config-based
 *   `icons` field replaces that file convention, a missing one leaves it in place).
 */
export type IconMetadata = Pick<Metadata, "icons" | "other">

export const buildIconMetadata = (branding: TenantBranding): IconMetadata => {
  const set = branding.app_icons

  if (!set) {
    const url = branding.favicon_url
    return url ? { icons: { icon: url, shortcut: url, apple: url } } : {}
  }

  const icon: { url: string; sizes?: string; type?: string }[] = []

  // `sizes="32x32"`, not `any`: Chrome takes an .ico marked `any` over the SVG next to it.
  if (set.favicon_ico_url) {
    icon.push({ url: set.favicon_ico_url, sizes: "32x32" })
  }
  if (set.icon_svg_url) {
    icon.push({ url: set.icon_svg_url, type: "image/svg+xml" })
  }
  if (set.icon_192_url) {
    icon.push({ url: set.icon_192_url, sizes: "192x192", type: "image/png" })
  }
  if (set.icon_512_url) {
    icon.push({ url: set.icon_512_url, sizes: "512x512", type: "image/png" })
  }
  if (!icon.length && branding.favicon_url) {
    icon.push({ url: branding.favicon_url })
  }

  const metadata: IconMetadata = {
    icons: {
      icon,
      apple: set.apple_touch_icon_url ? [{ url: set.apple_touch_icon_url, sizes: "180x180" }] : [],
      other: set.mask_icon_url
        ? [
            {
              rel: "mask-icon",
              url: set.mask_icon_url,
              color: branding.primary_color ?? set.background_color ?? "#000000",
            },
          ]
        : [],
    },
  }

  // The tiles are a white silhouette drawn for the master's own field, so the tile colour is that
  // field first and the shop's primary colour only when the set has none.
  const tileColor = set.background_color ?? branding.primary_color

  if (set.mstile_150_url || set.mstile_310_url) {
    metadata.other = {
      ...(tileColor ? { "msapplication-TileColor": tileColor } : {}),
      ...(set.mstile_150_url
        ? {
            "msapplication-TileImage": set.mstile_150_url,
            "msapplication-square150x150logo": set.mstile_150_url,
          }
        : {}),
      ...(set.mstile_310_url ? { "msapplication-square310x310logo": set.mstile_310_url } : {}),
    }
  }

  return metadata
}
