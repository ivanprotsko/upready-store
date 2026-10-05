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
 * - nothing: the standard placeholder at `/icon.svg` (`./placeholder-icon.ts`), which
 *   `app/tenant-icon/[file]/route.ts` serves for a shop with no upload (t-2026-10-04-21: that
 *   path is the shop's own now, not a static `app/icon.svg` every shop shared).
 */
export type IconMetadata = Pick<Metadata, "icons" | "other">

const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((index) => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Safari paints the pinned-tab silhouette on a light tab bar, so it takes the darker of the
 * icon's field and mark: the green field of a white «Ч», the dark mark of a white-field one. */
const pinnedTabColor = (field: string | null, mark: string | null): string | null => {
  if (field && mark) {
    return luminance(field) <= luminance(mark) ? field : mark
  }
  return field ?? mark
}

export const buildIconMetadata = (branding: TenantBranding): IconMetadata => {
  const set = branding.app_icons

  if (!set) {
    const url = branding.favicon_url
    return url
      ? { icons: { icon: url, shortcut: url, apple: url } }
      : { icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }] } }
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
              color: branding.primary_color ?? pinnedTabColor(set.background_color, set.mark_color) ?? "#000000",
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
