/**
 * Shape of profile.generated.json, written by scripts/build-profile.mjs from the backend
 * profile directory (schema upready.store-profile/v0,
 * specs/store-profiles/store-profile.schema.json).
 *
 * Every profile-driven section is nullable on purpose: the `default` profile carries none
 * of them, and an absent section must render as absent markup rather than as a placeholder.
 */

export type HeroLayout = "full-bleed" | "split" | "announcement"
export type ImageAspect = "1:1" | "4:5" | "3:4"
export type ImageFit = "cover" | "contain"
export type ImageRadius = "none" | "md" | "lg"
export type ImageHover = "none" | "second-image" | "zoom"

export type ProfileHero = {
  layout: HeroLayout
  headline: string
  subheadline: string | null
  cta: { label: string; href: string } | null
  /** Absolute URL, or a path on the storefront's own origin. */
  image: string | null
}

export type ProfileCategoryTile = {
  categoryHandle: string
  label: string
  image: string | null
}

export type ProfilePromoStrip = {
  enabled: boolean
  text: string | null
}

export type ProfileImageTreatment = {
  aspect: ImageAspect
  fit: ImageFit
  radius: ImageRadius
  hover: ImageHover
}

export type ProfileBrand = {
  name: string
  tagline: string | null
  wordmark: { text: string; style: "wordmark" | "monogram" } | null
}

export type StorefrontProfile = {
  schema: "upready.storefront-profile/v0"
  id: string
  /** "backend" when a profile directory was read, "default" when none was found. */
  source: "backend" | "default"
  brand: ProfileBrand | null
  home: {
    hero: ProfileHero | null
    categoryTiles: ProfileCategoryTile[]
    promoStrip: ProfilePromoStrip | null
  }
  layout: {
    imageTreatment: ProfileImageTreatment | null
  }
  /** Per-locale overrides, keyed by two-letter locale. */
  i18n: Record<string, { promoStrip?: string }>
  generatedAt?: string
}
