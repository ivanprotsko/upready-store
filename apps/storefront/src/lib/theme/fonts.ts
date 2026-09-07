/**
 * The twelve families a store profile may name, and the `next/font/google` export that
 * loads each one. The list is the enum of
 * `specs/store-profiles/store-profile.schema.json#/definitions/font`; the two must not
 * drift, and `fonts.test.ts` compares them on every run.
 *
 * HOW ONLY THE ACTIVE PAIR SHIPS
 * ------------------------------
 * `next/font/google` is a BUILD-TIME loader: every call is transformed by Next into a
 * downloaded font file plus a stylesheet that is injected wherever the calling module
 * is imported. The calls must sit at module scope with literal arguments, so a map of
 * twelve loaders cannot be lazy — a module holding twelve calls emits twelve
 * stylesheets and twelve families into the build output, for every visitor, whichever
 * profile is active. That is the bug this file exists to avoid.
 *
 * So this module deliberately calls NOTHING. It is the allow-list and the contract;
 * `scripts/build-themes.mjs` reads it, resolves the active profile's pair, and writes
 * `fonts.generated.ts` containing exactly two loader calls. Two calls in, two families
 * out — the other ten never enter the module graph.
 *
 * A name outside the allow-list is rejected by `assertFontName` inside that generator,
 * which exits non-zero: the failure lands at build time with the offending name in the
 * message, never as a silent fallback to the system stack at runtime.
 */

/** Exactly the enum of store-profile.schema.json#/definitions/font, in its order. */
export const FONT_NAMES = [
  "Geist",
  "Inter",
  "Manrope",
  "DM Sans",
  "Space Grotesk",
  "Playfair Display",
  "Fraunces",
  "Cormorant Garamond",
  "Nunito",
  "Sora",
  "IBM Plex Sans",
  "IBM Plex Mono",
] as const

export type FontName = (typeof FONT_NAMES)[number]

/** Family name -> the identifier `next/font/google` exports for it. */
export const FONT_LOADERS: Record<FontName, string> = {
  Geist: "Geist",
  Inter: "Inter",
  Manrope: "Manrope",
  "DM Sans": "DM_Sans",
  "Space Grotesk": "Space_Grotesk",
  "Playfair Display": "Playfair_Display",
  Fraunces: "Fraunces",
  "Cormorant Garamond": "Cormorant_Garamond",
  Nunito: "Nunito",
  Sora: "Sora",
  "IBM Plex Sans": "IBM_Plex_Sans",
  "IBM Plex Mono": "IBM_Plex_Mono",
}

/**
 * The two CSS variables a profile's typography reaches the page through. Binding them
 * to elements is the profile/UI layer's decision, not the bridge's: themes.css does not
 * set `font-family` anywhere, so a profile can be active without moving a single pixel.
 */
export const FONT_VARIABLES = {
  display: "--font-display",
  body: "--font-body",
} as const

/**
 * Families with no variable axis in Google's catalogue. `next/font/google` refuses a
 * call without an explicit `weight` for these, so the generator reads the list here.
 * Comma-separated because scripts/build-themes.mjs parses this file as flat string
 * data rather than compiling it (see loadFontAllowList there).
 * Measured against next@15.5.21 dist/compiled/@next/font/dist/google/font-data.json:
 * eleven of the twelve carry a "variable" weight; IBM Plex Mono does not.
 */
export const FONT_STATIC_WEIGHTS: Partial<Record<FontName, string>> = {
  "IBM Plex Mono": "400,500,600,700",
}

export function isFontName(name: unknown): name is FontName {
  return typeof name === "string" && (FONT_NAMES as readonly string[]).includes(name)
}

/** Loud on the way out: the generator exits with this message rather than guessing. */
export function assertFontName(name: unknown, where: string): FontName {
  if (!isFontName(name)) {
    throw new Error(
      `${where}: "${String(name)}" is not one of the twelve allow-listed fonts ` +
        `(${FONT_NAMES.join(", ")}). Add it to FONT_NAMES and to ` +
        `specs/store-profiles/store-profile.schema.json#/definitions/font, or fix the profile.`
    )
  }
  return name
}
