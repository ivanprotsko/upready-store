/**
 * Every switchable axis of the look lives here, and nowhere else: the `<html>`
 * attribute that carries it, the localStorage key that persists it, the allow-list of
 * accepted values and the value used when nothing has been chosen.
 *
 * ONE registry, three consumers: the pre-paint script (which reads localStorage before
 * the first paint), `apply.ts` (which writes both at runtime), and the settings panel
 * (which renders one section per axis). Adding the card and image axes of T0j/T0k —
 * `data-image-aspect`, `data-image-fit`, `data-image-radius`, `data-image-hover`,
 * `data-card` — is one AXES entry each, appended below; nothing else in this directory
 * has to be touched, because the pre-paint script is generated FROM this array.
 */

import { THEME_IDS, THEME_MODES } from "./presets.generated"

export type ThemeAxis = {
  /** the `<html>` attribute this axis writes */
  readonly attr: string
  /** the localStorage key that persists it per browser */
  readonly storageKey: string
  /** accepted values; anything else is ignored by the pre-paint and rejected by apply() */
  readonly allowed: readonly string[]
  /** what SSR renders when neither a profile nor localStorage has an opinion */
  readonly fallback: string
}

export const AXES = [
  {
    attr: "data-theme",
    storageKey: "upready-store.theme",
    // "default" is an alias of the medusa preset (see build-themes.mjs DEFAULT_ALIAS_OF),
    // so a storefront with no profile still renders today's look.
    allowed: ["default", ...THEME_IDS],
    fallback: "default",
  },
  {
    attr: "data-mode",
    storageKey: "upready-store.mode",
    allowed: THEME_MODES,
    fallback: "light",
  },
] as const satisfies readonly ThemeAxis[]

export type AxisAttr = (typeof AXES)[number]["attr"]

export function axis(attr: AxisAttr): ThemeAxis {
  const found = AXES.find((a) => a.attr === attr)
  if (!found) throw new Error(`theme: no axis registered for ${attr}`)
  return found
}

/** Narrowing guard used by both apply() and the panel; never throws. */
export function isAllowed(attr: AxisAttr, value: unknown): value is string {
  return typeof value === "string" && axis(attr).allowed.includes(value)
}
