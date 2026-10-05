/**
 * The standard placeholder icon of a shop that uploaded none (ask-20261006-021217-bd59), served
 * at `/icon.svg` by `app/tenant-icon/[file]/route.ts`. One drawing for every shop: a rounded
 * square in the shop's primary colour (near-black without one) and the first letter of its name,
 * so two shops with nothing uploaded still tell apart on the tab bar.
 *
 * The owner's panel puts the same drawing on its own tab (`apps/tenant-panel/src/lib/
 * shop-favicon.ts`). The two apps share no package, so the few lines are repeated and each
 * side's test pins the same output.
 */
const PLACEHOLDER_FIELD = "#18181B"
const PLACEHOLDER_INK = "#ffffff"
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

// A shop with no letter to show: an awning over a shopfront with a door.
const STOREFRONT_MARK = "M18 18h28l6 11H12zM16 32h32v14H16zM28 36v10h8V36z"

// Whitespace, ASCII punctuation and the typographic marks a shop's name opens or wraps itself with.
// A class of what is skipped rather than `\p{L}`: the storefront compiles to ES5, which has no `u` flag.
const NOT_A_LETTER = /[\s\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f«»„“”‘’‹›—–…·•№]/

/** The first letter or digit of the shop's name, upper-cased; empty for a name that has none. */
export const placeholderIconLetter = (name: string | null | undefined): string => {
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

export const placeholderIconSvg = ({ name, color, ink }: PlaceholderInput = {}): string => {
  const hasColor = !!color && HEX_COLOR.test(color)
  const field = hasColor ? color : PLACEHOLDER_FIELD
  const mark = hasColor && ink && HEX_COLOR.test(ink) ? ink : PLACEHOLDER_INK
  // `placeholderIconLetter` never answers a character XML treats as markup, so nothing here needs escaping.
  const letter = placeholderIconLetter(name)
  const drawing = letter
    ? `<text x="32" y="33" text-anchor="middle" dominant-baseline="central" font-family="system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif" font-size="38" font-weight="700" fill="${mark}">${letter}</text>`
    : `<path fill-rule="evenodd" d="${STOREFRONT_MARK}" fill="${mark}"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64" rx="14" fill="${field}"/>${drawing}</svg>`
}
