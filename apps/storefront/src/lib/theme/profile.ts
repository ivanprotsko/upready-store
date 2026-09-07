/**
 * Reads the ACTIVE PROFILE's theme defaults for SSR.
 *
 * `src/lib/profile/profile.generated.json` is written by `scripts/build-profile.mjs`
 * from the selected store profile. This module must survive three states of that file,
 * because the storefront has to build in all three:
 *
 *   - the file is absent (a checkout that has never run build-profile);
 *   - the file exists but carries no `theme` block (an older generator, or a profile
 *     that only describes copy and layout);
 *   - the file exists with a `theme` block naming a preset this build does not ship.
 *
 * In every one of those the answer is `{ theme: "default", mode: "light" }`, which the
 * generated themes.css resolves to the medusa preset — today's look. The storefront
 * never fails to render because a profile is missing or wrong; it falls back and says
 * so in the returned `source` field, which the settings panel can show.
 *
 * The require() is deliberate: a static `import` of a file that may not exist fails the
 * TypeScript build, and a top-level `await import()` would make this module async for
 * every caller. The catch covers both "no such file" and "not valid JSON".
 */

import { AXES, axis } from "./attributes"

export type ProfileTheme = {
  theme: string
  mode: string
  /** where the answer came from, for the panel's source line (rule 18e) */
  source: "profile" | "fallback"
}

type ProfileShape = {
  theme?: {
    presetId?: unknown
    defaultMode?: unknown
    typography?: { display?: unknown; body?: unknown }
  }
}

export function readProfileTheme(): ProfileTheme {
  const fallback: ProfileTheme = {
    theme: axis("data-theme").fallback,
    mode: axis("data-mode").fallback,
    source: "fallback",
  }

  let profile: ProfileShape | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    profile = require("../profile/profile.generated.json") as ProfileShape
  } catch {
    return fallback
  }

  const declared = profile?.theme
  if (!declared) return fallback

  const theme = allowedOr(declared.presetId, "data-theme", fallback.theme)
  const mode = allowedOr(declared.defaultMode, "data-mode", fallback.mode)
  const usedProfile = theme !== fallback.theme || mode !== fallback.mode
  return { theme, mode, source: usedProfile ? "profile" : "fallback" }
}

function allowedOr(value: unknown, attr: (typeof AXES)[number]["attr"], fallback: string): string {
  return typeof value === "string" && axis(attr).allowed.includes(value) ? value : fallback
}

/** The profile's font pair, or null when the profile names none. Used by themes:build. */
export function readProfileFonts(): { display: string; body: string } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const profile = require("../profile/profile.generated.json") as ProfileShape
    const t = profile?.theme?.typography
    if (typeof t?.display === "string" && typeof t?.body === "string") {
      return { display: t.display, body: t.body }
    }
  } catch {
    // fall through
  }
  return null
}
