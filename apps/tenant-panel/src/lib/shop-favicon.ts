import type { TenantBranding } from "../hooks/api/branding"

/**
 * The browser-tab icon of the panel (ask-20261006-021217-bd59): the icon of the shop that is
 * open, so two tabs with two shops' panels tell apart, and the icon follows the shop when the
 * header's switcher moves the session to another one.
 *
 * Three cases, the same order the storefront's `<link>`s take (`lib/tenant/icons.ts` there):
 * - an icon set (`branding.app_icons`, built by the backend from the favicon upload on
 *   «Оформление»): the .ico, the SVG and the 192 PNG of it;
 * - only the single `favicon_url` of an upload from before the set existed: that URL;
 * - nothing uploaded: the standard placeholder, the first letter of the shop's name on its
 *   primary colour.
 *
 * With no shop at all (the login screen, the moment before the first answer) the tab shows
 * `public/favicon.svg`, the same placeholder with a storefront mark in place of a letter.
 *
 * Plain data and strings, no JSX: `__tests__/shop-favicon.test.mjs` imports and runs it.
 */
export type FaviconLink = { href: string; type?: string; sizes?: string }

/** The file `index.html` links: the placeholder of a tab that has no shop yet. */
export const DEFAULT_FAVICON: FaviconLink = { href: "/favicon.svg", type: "image/svg+xml" }

const PLACEHOLDER_FIELD = "#18181B"
const PLACEHOLDER_INK = "#ffffff"
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

// A shop with no letter to show: an awning over a shopfront with a door.
const STOREFRONT_MARK = "M18 18h28l6 11H12zM16 32h32v14H16zM28 36v10h8V36z"

// Whitespace, ASCII punctuation and the typographic marks a shop's name opens or wraps itself with.
// A class of what is skipped rather than `\p{L}`: the storefront compiles to ES5, which has no `u` flag.
const NOT_A_LETTER = /[\s\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f«»„“”‘’‹›—–…·•№]/

/** The first letter or digit of the shop's name, upper-cased; empty for a name that has none. */
export const faviconLetter = (name: string | null | undefined): string => {
  for (const char of Array.from(name ?? "")) {
    if (char > " " && !NOT_A_LETTER.test(char)) {
      return char.toUpperCase()
    }
  }

  return ""
}

type PlaceholderInput = {
  name?: string | null
  /** The shop's primary colour and the text colour the backend picked for it. */
  color?: string | null
  ink?: string | null
}

/**
 * The standard placeholder icon. One drawing for every shop: a rounded square in the shop's
 * primary colour (near-black without one) and the first letter of its name. The storefront
 * serves the same drawing at `/icon.svg` for a shop with nothing uploaded
 * (`lib/tenant/placeholder-icon.ts` there; the panel is its own app with no shared package,
 * so the few lines are repeated and each side's test pins the same output).
 */
export const shopPlaceholderSvg = ({ name, color, ink }: PlaceholderInput = {}): string => {
  const hasColor = !!color && HEX_COLOR.test(color)
  const field = hasColor ? color : PLACEHOLDER_FIELD
  const mark = hasColor && ink && HEX_COLOR.test(ink) ? ink : PLACEHOLDER_INK
  // `faviconLetter` never answers a character XML treats as markup, so nothing here needs escaping.
  const letter = faviconLetter(name)
  const drawing = letter
    ? `<text x="32" y="33" text-anchor="middle" dominant-baseline="central" font-family="system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif" font-size="38" font-weight="700" fill="${mark}">${letter}</text>`
    : `<path fill-rule="evenodd" d="${STOREFRONT_MARK}" fill="${mark}"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64" rx="14" fill="${field}"/>${drawing}</svg>`
}

const svgDataUrl = (svg: string): string => `data:image/svg+xml,${encodeURIComponent(svg)}`

type ShopFaviconInput = {
  /** The open shop's name; nothing while no shop is open. */
  name?: string | null
  branding?: Pick<TenantBranding, "favicon_url" | "app_icons" | "primary_color" | "primary_foreground"> | null
}

export const shopFaviconLinks = ({ name, branding }: ShopFaviconInput): FaviconLink[] => {
  const links: FaviconLink[] = []
  const set = branding?.app_icons

  if (set) {
    // `sizes="32x32"`, not `any`: Chrome takes an .ico marked `any` over the SVG next to it.
    if (set.favicon_ico_url) {
      links.push({ href: set.favicon_ico_url, sizes: "32x32" })
    }
    if (set.icon_svg_url) {
      links.push({ href: set.icon_svg_url, type: "image/svg+xml" })
    }
    if (set.icon_192_url) {
      links.push({ href: set.icon_192_url, sizes: "192x192", type: "image/png" })
    }
  }
  if (!links.length && branding?.favicon_url) {
    links.push({ href: branding.favicon_url })
  }
  if (links.length) {
    return links
  }

  if (!faviconLetter(name)) {
    return [DEFAULT_FAVICON]
  }

  return [
    {
      href: svgDataUrl(
        shopPlaceholderSvg({ name, color: branding?.primary_color, ink: branding?.primary_foreground })
      ),
      type: "image/svg+xml",
    },
  ]
}
