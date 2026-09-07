import generated from "./profile.generated.json"
import type { StorefrontProfile } from "./types"

/**
 * The store profile, baked in at build time by scripts/build-profile.mjs (predev/prebuild).
 * It is a plain import, not a fetch: nothing on a listing page may reach the backend or the
 * request context to decide how the page looks, or the page stops being statically renderable.
 */
export const profile = generated as StorefrontProfile

export const hero = profile.home.hero
export const categoryTiles = profile.home.categoryTiles
export const promoStrip = profile.home.promoStrip
export const imageTreatment = profile.layout.imageTreatment

/**
 * Promo strip copy for a locale: the profile's own override, else the English base text.
 * A locale with no override never falls through to an empty strip.
 */
export function promoText(locale: string): string | null {
  if (!promoStrip || !promoStrip.enabled) return null
  return profile.i18n[locale]?.promoStrip ?? promoStrip.text ?? null
}

export * from "./types"
