import { PT_Serif, Roboto_Flex, Ruslan_Display } from "next/font/google"

/**
 * BRANCH-LOCAL (`redesign-olavka`, t-2026-09-24-n15): the three typefaces Ivan's Figma
 * node 227-8180 draws with, beside the profile pair `fonts.generated.ts` instantiates
 * (`build-themes.mjs` owns that file, so these are not added there). Loaded through
 * `next/font/google` like the profile pair — self-hosted at build time, no runtime request
 * to Google — and exposed as CSS variables the Olavka components read:
 *
 *   --font-olavka-wordmark  Ruslan Display 400   the header wordmark (32px / 24px scrolled)
 *   --font-olavka-serif     PT Serif 400/700 italic   the Cover's two lines
 *   --font-olavka-flex      Roboto Flex (variable)    the slider's banner labels, uppercase
 *
 * `cyrillic` is in every subset list: the shop and every label on the node are Russian.
 */
const wordmark = Ruslan_Display({
  weight: "400",
  subsets: ["cyrillic", "latin"],
  display: "swap",
  variable: "--font-olavka-wordmark",
})

const serif = PT_Serif({
  weight: ["400", "700"],
  style: ["normal", "italic"],
  subsets: ["cyrillic", "latin"],
  display: "swap",
  variable: "--font-olavka-serif",
})

const flex = Roboto_Flex({
  subsets: ["cyrillic", "latin"],
  display: "swap",
  variable: "--font-olavka-flex",
})

export const olavkaFontClassName = `${wordmark.variable} ${serif.variable} ${flex.variable}`
