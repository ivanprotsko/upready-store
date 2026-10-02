/**
 * Inter 500 for the Olavka shop only — the face `--font-olavka-ui` and the Olavka pages'
 * body text resolve to. It used to be a `next/font/google` loader in `olavka-fonts.ts`,
 * but that registers a global `@font-face { font-family: Inter }` in the root layout's
 * CSS, and every shop's base stack starts with `Inter`: every other shop switched from
 * its system font to this webfont. The same seven Google subsets are served from
 * `public/fonts/olavka/` and declared by a `<style>` the root layout renders only when
 * `isOlavkaShop()`, so no other shop's page ever sees the face.
 */
const FACES: ReadonlyArray<readonly [file: string, unicodeRange: string]> = [
  ["inter-500-cyrillic-ext.woff2", "U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F"],
  ["inter-500-cyrillic.woff2", "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116"],
  ["inter-500-greek-ext.woff2", "U+1F??"],
  ["inter-500-greek.woff2", "U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF"],
  ["inter-500-vietnamese.woff2", "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB"],
  ["inter-500-latin-ext.woff2", "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF"],
  ["inter-500-latin.woff2", "U+00??,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"],
]

const url = (file: string) => `/fonts/olavka/${file}`

export const OLAVKA_INTER_CSS =
  FACES.map(
    ([file, range]) =>
      `@font-face{font-family:Inter;font-style:normal;font-weight:500;font-display:swap;src:url(${url(file)}) format("woff2");unicode-range:${range}}`
  ).join("") +
  `:root{--font-olavka-ui:Inter,-apple-system,"system-ui","Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif}`

/** The two subsets every Olavka page renders text in, preloaded the way next/font did. */
export const OLAVKA_INTER_PRELOAD = ["inter-500-cyrillic.woff2", "inter-500-latin.woff2"].map(url)
