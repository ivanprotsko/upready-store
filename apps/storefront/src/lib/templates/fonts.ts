import type { FontName } from "@lib/theme/fonts"

/**
 * The fonts a template brings with it (t-2026-10-12-33 T0a), apart from the build profile's.
 *
 * `next/font` loads only the build profile's pair, at build time (`lib/theme/fonts.ts`), and
 * that path is left as it is. A template's pair comes from self-hosted woff2 instead:
 * `public/fonts/templates/*.woff2`, declared by `public/fonts/templates/fonts.css`, which also
 * holds the `[data-font-pair]` rules that set `--font-display` and `--font-body` and put the
 * page text in them. The root layout links that stylesheet and writes the attribute only for
 * a template whose two families are both here, so a shop with no template loads nothing new.
 */
export const TEMPLATE_FONTS_STYLESHEET = "/fonts/templates/fonts.css"

/**
 * The families with files, Latin and Cyrillic: the eight of `FONT_NAMES` the 16.09 templates lab
 * took. DM Sans, Space Grotesk, Fraunces and Sora have no Cyrillic and no file (LICENSES.md
 * beside the files). `fonts.test.ts` holds this list to the stylesheet's `@font-face` rules, and
 * every family but Playfair Display, whose source has no ₽, to a ruble-sign face (T0c).
 */
export const TEMPLATE_FONT_FAMILIES = [
  "Cormorant Garamond",
  "Geist",
  "IBM Plex Mono",
  "IBM Plex Sans",
  "Inter",
  "Manrope",
  "Nunito",
  "Playfair Display",
] as const satisfies readonly FontName[]

const hasFiles = (name: FontName) => (TEMPLATE_FONT_FAMILIES as readonly string[]).includes(name)

/**
 * The value of `<html data-font-pair>`, `"<display>|<body>"`, when both families have files;
 * null otherwise, and the page keeps the type it had.
 */
export function templateFontPair(pair: { display: FontName; body: FontName }): string | null {
  return hasFiles(pair.display) && hasFiles(pair.body) ? `${pair.display}|${pair.body}` : null
}
