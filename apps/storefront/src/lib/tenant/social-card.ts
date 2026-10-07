import type { Metadata } from "next"
import type { TenantBranding } from "./branding"

/**
 * The picture a messenger or a social network shows next to a link to the shop
 * (t-2026-10-08-13). A shop that uploaded no picture of its own used to answer
 * with the build's default file, which is the starter's own advertisement with
 * a clothing shop on it, and every page carried the starter's English `alt`.
 * A shop now gets a plain card with its own name, and the `alt` is that name.
 *
 * Split out of `app/opengraph-image.tsx` so the rules are testable without
 * `next/headers`: the route files read the request and hand the plain values here.
 */
export const SOCIAL_CARD_SIZE = { width: 1200, height: 630 }
export const SOCIAL_CARD_CONTENT_TYPE = "image/png"

export type SocialImageSource = "own" | "card" | "default"

/**
 * Which picture this request gets. The shop's own upload always wins. A host
 * with no shop behind it keeps the build's default file, unchanged.
 */
export const socialImageSource = (input: {
  hasTenant: boolean
  ogImageUrl: string | null
}): SocialImageSource => {
  if (input.ogImageUrl) {
    return "own"
  }

  return input.hasTenant ? "card" : "default"
}

/**
 * The scripts the bundled face (`public/og/fonts/inter-600.ttf`) can draw. A
 * name in any other script would come out as empty boxes, and the image
 * library would then try to download a face for it from a third party while
 * the request waits. Such a shop gets the card without the name; the `alt`
 * still carries it.
 */
// Built from a string: the build targets es5, where a literal may not carry the `u` flag.
const DRAWABLE = new RegExp(
  "^[\\p{Script=Latin}\\p{Script=Cyrillic}\\p{Script=Greek}\\p{Nd}\\p{P}\\p{Zs}№₽€$+]+$",
  "u"
)

export const socialCardText = (shopName: string): string | null => {
  const name = shopName.trim()
  return name && DRAWABLE.test(name) ? name : null
}

/** The longer the name, the smaller the type, so three lines always fit the card. */
export const socialCardFontSize = (text: string): number => {
  if (text.length <= 16) {
    return 120
  }

  return text.length <= 40 ? 88 : 60
}

/**
 * The shop's own colour with the ink the backend picked for it, when the shop
 * set one. A PNG drawn on the server knows no CSS variable, so the fallback is
 * a literal pair.
 */
export const socialCardColors = (
  branding: Pick<TenantBranding, "primary_color" | "primary_foreground">
): { background: string; color: string } => {
  if (branding.primary_color) {
    // theme-colours allowlist: the owner's brand pipeline; the backend computes the ink, this only covers its absence.
    return { background: branding.primary_color, color: branding.primary_foreground ?? "#ffffff" }
  }

  // theme-colours allowlist: a server-drawn PNG has no theme tokens; plain ink on white for a shop with no colour.
  return { background: "#ffffff", color: "#18181b" }
}

/**
 * `og:image` and `twitter:image` with the shop's name as their `alt`. Set from
 * `generateMetadata` of `app/[locale]/layout.tsx`, where `images` replace the
 * ones the `opengraph-image.tsx` and `twitter-image.tsx` files add with their
 * fixed `alt`; that layout says why there and not in the root one. The URLs
 * stay the same two routes. No shop means no keys at all, so that host renders
 * as before.
 */
export const buildSocialImageMetadata = (
  shopName: string | null
): Pick<Metadata, "openGraph" | "twitter"> => {
  const alt = shopName?.trim()

  if (!alt) {
    return {}
  }

  const image = (url: string) => ({ url, alt, type: SOCIAL_CARD_CONTENT_TYPE, ...SOCIAL_CARD_SIZE })

  return {
    openGraph: { images: [image("/opengraph-image")] },
    twitter: { card: "summary_large_image", images: [image("/twitter-image")] },
  }
}
