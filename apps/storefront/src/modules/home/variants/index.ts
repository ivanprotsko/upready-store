import type { ComponentType } from "react"

import type { HeroKey, ListingKey, TilesKey } from "@lib/theme/composition"
import FeaturedProducts from "@modules/home/components/featured-products"
import ProfileHero from "@modules/home/components/profile-hero"

/**
 * Home-slot composition registries — hero and listing (`(main)/page.tsx` only; header and
 * footer are site-wide, `nav/variants` and `footer/variants`). Plain data, no JSX (pure
 * `.ts`, mirroring `nav/variants/index.ts` and `footer/variants/index.ts`) — `page.tsx`
 * itself is the home switch, the way `nav/index.tsx`/`footer/index.tsx` are for their own
 * slots, and reads `getStorefrontSettings()` once for all three home slots rather than
 * once per slot.
 *
 * Every entry is a zero-prop server component that fetches its own data (`ProfileHero`
 * reads `@lib/profile` at build time, `FeaturedProducts` calls its own region/product
 * loaders) — nothing here prop-drills beyond the single key that selected it.
 *
 * Only K (`ProfileHero`, already three layouts) and the page's existing product listing
 * (`FeaturedProducts`, mapped to P1) are built. Every other hero/listing key maps to that
 * same baseline as a placeholder — W11 (hero G/H/M + listing P1-P5 data) and W12 (hero
 * GA/GB) replace exactly the entries they ship, leaving this shape and every
 * still-placeholder key untouched. Tiles has no per-key variant family (`TilesKey` is a
 * boolean switch, not an enum of components) — `CategoryTiles` itself is the only
 * implementation and already self-suppresses on an empty tile list
 * (`block-port-map.md` §5), so it needs only the `DEFAULT_TILES` constant below, no
 * registry.
 */

type SlotComponent = ComponentType

/**
 * `HeroKey` minus `"none"`: block-port-map.md §4's `none` row assigns its own ~5-line
 * guard to "the new switch" (`page.tsx`, below) — `"none"` never reaches this map. Every
 * other key, including `k` itself, points at today's `ProfileHero`, which already
 * dispatches on the profile's own `hero.layout` (full-bleed/split/announcement) and
 * returns `null` when the profile has no hero at all.
 */
export const HERO_VARIANTS: Record<Exclude<HeroKey, "none">, SlotComponent> = {
  g: ProfileHero,
  h: ProfileHero,
  j: ProfileHero,
  k: ProfileHero,
  l: ProfileHero,
  m: ProfileHero,
  ga: ProfileHero,
  gb: ProfileHero,
}

/**
 * `panel-composition-mockup.md` §C1 "Absent" row: no saved settings → today's baseline
 * (the profile's own hero, unaffected by composition — never forced to `"none"`). Typed
 * as the registry's own key type (not the full `HeroKey`, which still carries `"none"`)
 * so `HERO_VARIANTS[DEFAULT_HERO]` indexes without a cast.
 */
export const DEFAULT_HERO: Exclude<HeroKey, "none"> = "k"

/** `panel-composition-mockup.md` §C1 "Absent" row: no saved settings → tiles-if-present,
 *  today's baseline (`CategoryTiles` renders whenever the profile has tiles, gated on
 *  nothing else) — `"on"` reproduces that exactly, since `CategoryTiles` still
 *  self-suppresses on an empty list. */
export const DEFAULT_TILES: TilesKey = "on"

/**
 * `ListingKey` minus `"none"`: block-port-map.md §6's `none` row assigns its guard to
 * "gate the `<FeaturedProducts/>` call in `page.tsx`", below. Every other key maps to
 * today's `FeaturedProducts` (the all-collections `ProductRail`) as the P1 placeholder —
 * it does not yet match the composer's real single-collection P1 shape
 * (block-port-map.md §6's own noted mismatch), which is W11's job, not this skeleton's.
 */
export const LISTING_VARIANTS: Record<Exclude<ListingKey, "none">, SlotComponent> = {
  p1: FeaturedProducts,
  p2: FeaturedProducts,
  p3: FeaturedProducts,
  p4: FeaturedProducts,
  p5: FeaturedProducts,
}

/**
 * `panel-composition-mockup.md` §C1 "Absent" row: no saved settings → today's baseline.
 * Typed as the registry's own key type (not the full `ListingKey`, which still carries
 * `"none"`) so `LISTING_VARIANTS[DEFAULT_LISTING]` indexes without a cast.
 */
export const DEFAULT_LISTING: Exclude<ListingKey, "none"> = "p1"
