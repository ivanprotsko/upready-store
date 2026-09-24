import type { ComponentType } from "react"

import type { HeroKey, ListingKey, TilesKey } from "@lib/theme/composition"
import type { HomeHeroProps, HomeListingProps } from "@modules/home/variants/types"
import ProfileHero from "@modules/home/components/profile-hero"
import HeroG from "@modules/home/variants/hero-g"
import HeroH from "@modules/home/variants/hero-h"
import HeroJ from "@modules/home/variants/hero-j"
import HeroM from "@modules/home/variants/hero-m"
import ListingP1 from "@modules/home/variants/listing-p1"
import ListingP2 from "@modules/home/variants/listing-p2"
import ListingP3 from "@modules/home/variants/listing-p3"
import ListingP4 from "@modules/home/variants/listing-p4"
import ListingP5 from "@modules/home/variants/listing-p5"

import HeroGA from "./hero-ga"
import HeroGB from "./hero-gb"
import OlavkaCover from "./olavka-cover"
import OlavkaHeroSlider from "./olavka-hero-slider"
import OlavkaNavigation from "./olavka-navigation"

/**
 * Home-slot composition registries — hero and listing (`(main)/page.tsx` only; header and
 * footer are site-wide, `nav/variants` and `footer/variants`). Plain data, no JSX (pure
 * `.ts`, mirroring `nav/variants/index.ts` and `footer/variants/index.ts`) — `page.tsx`
 * itself is the home switch, the way `nav/index.tsx`/`footer/index.tsx` are for their own
 * slots, and reads `getStorefrontSettings()` once for all three home slots rather than
 * once per slot.
 *
 * Every entry is a zero-prop server component that fetches its own data (`ProfileHero`
 * reads `@lib/profile` at build time, the hero-*, listing-* ports call their own region
 * and product loaders in `lib/data/home.ts`) — nothing here prop-drills beyond the single
 * key that selected it.
 *
 * K and L (still `ProfileHero`; L is W12/F9 territory) stay on the `ProfileHero` baseline; G/H/J/M and
 * P1-P5 are real ports (`home/variants/hero-*.tsx`, `home/variants/listing-*.tsx`,
 * `2026-09-09-block-port-map.md` §4/§6) and GA/GB are the two hero galleries (`HeroGA`/`HeroGB`,
 * client islands over a server-fetched category slide list). Tiles has no per-key variant family (`TilesKey` is a
 * boolean switch, not an enum of components) — `CategoryTiles` itself is the only
 * implementation and already self-suppresses on an empty tile list
 * (`block-port-map.md` §5), so it needs only the `DEFAULT_TILES` constant below, no
 * registry.
 */

/**
 * Tenant panel wave 2, piece 8: the hero and listing entries now take the tenant's own
 * home-page content as optional props (`types.ts`). Every variant still works with no
 * props at all — a zero-prop component is assignable to `ComponentType<P>` when every
 * field of `P` is optional — so the five old stands, which pass nothing, are unchanged.
 */
type HeroComponent = ComponentType<HomeHeroProps>
type ListingComponent = ComponentType<HomeListingProps>

/**
 * `HeroKey` minus `"none"`: block-port-map.md §4's `none` row assigns its own ~5-line
 * guard to "the new switch" (`page.tsx`, below) — `"none"` never reaches this map. `ga` and
 * `gb` point at this package's own `HeroGA`/`HeroGB` (`hero-ga.tsx`/`hero-gb.tsx`) — the two
 * built galleries. Every other key, including `k` itself, still points at today's
 * `ProfileHero`, which already dispatches on the profile's own `hero.layout`
 * (full-bleed/split/announcement) and returns `null` when the profile has no hero at all;
 * `ga`/`gb` fall back the same way, to no markup, below their own 3-slide floor
 * (`hero-gallery-data.ts`'s `MIN_SLIDES`).
 */
export const HERO_VARIANTS: Record<Exclude<HeroKey, "none">, HeroComponent> = {
  g: HeroG,
  h: HeroH,
  j: HeroJ,
  k: ProfileHero,
  l: ProfileHero,
  m: HeroM,
  ga: HeroGA,
  gb: HeroGB,
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
 * "gate the `<Listing/>` call in `page.tsx`", below. `p1` is now the real single-collection
 * grid the composer's own comment calls the storefront's baseline
 * (block-port-map.md §6, §10 fork resolution "(b) repurpose the P1 slot with a true
 * single-collection grid") — the former placeholder, `FeaturedProducts`' all-collections
 * `ProductRail` loop, is no longer reachable from this registry. `ProductRail` itself is
 * untouched and still exists (`home/components/featured-products/`) in case something
 * outside this switch still wants it; nothing here does.
 */
export const LISTING_VARIANTS: Record<Exclude<ListingKey, "none">, ListingComponent> = {
  p1: ListingP1,
  p2: ListingP2,
  p3: ListingP3,
  p4: ListingP4,
  p5: ListingP5,
}

/**
 * `panel-composition-mockup.md` §C1 "Absent" row: no saved settings → today's baseline.
 * Typed as the registry's own key type (not the full `ListingKey`, which still carries
 * `"none"`) so `LISTING_VARIANTS[DEFAULT_LISTING]` indexes without a cast.
 */
export const DEFAULT_LISTING: Exclude<ListingKey, "none"> = "p1"

/**
 * The order the three home blocks render in when the tenant's document does not say
 * (`content.order`) — hero, category tiles, listing, which is the order `(main)/page.tsx`
 * has always composed them in (frame 17 of `2026-09-07-profile-home-mockup.md`). A block
 * missing from a saved `order` is not rendered at all, which is how the panel turns one
 * off; the default names all three, so nothing disappears on a stand without a document.
 */
export const DEFAULT_BLOCK_ORDER = ["hero", "categories", "products"] as const
export type HomeBlockKey = (typeof DEFAULT_BLOCK_ORDER)[number]

/**
 * BRANCH-LOCAL DEMO (`redesign-olavka`, t-2026-09-24-n15): the three home blocks built
 * after Ivan's Figma node 227-8180 — Cover, Navigation, HeroSlider — and the order they
 * render in, ABOVE the tenant's own composed blocks (`(main)/page.tsx` reads this list
 * first, then `content.order`). None of the three is a key of the tenant document
 * (`HomeBlock` in `lib/data/tenant-home.ts` still names hero/categories/products only),
 * so no saved document changes meaning and the stand's DB is never written. An empty
 * list restores today's page exactly. Empty it (or delete it) before this branch is ever
 * merged; the panel then needs real block keys for these.
 */
export const DEMO_HOME_BLOCKS = {
  olavkaCover: OlavkaCover,
  olavkaNavigation: OlavkaNavigation,
  olavkaHeroSlider: OlavkaHeroSlider,
} as const
export type DemoHomeBlockKey = keyof typeof DEMO_HOME_BLOCKS
/** Figma order, top to bottom, as Ivan listed the components (Header, then these three). */
export const DEMO_HOME_ORDER: readonly DemoHomeBlockKey[] = [
  "olavkaCover",
  "olavkaNavigation",
  "olavkaHeroSlider",
]
