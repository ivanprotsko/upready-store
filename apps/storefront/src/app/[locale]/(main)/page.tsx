import type { Metadata } from "next"
import { Suspense } from "react"

import CategoryTiles from "@modules/home/components/category-tiles"
import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import {
  DEFAULT_HERO,
  DEFAULT_LISTING,
  DEFAULT_TILES,
  HERO_VARIANTS,
  LISTING_VARIANTS,
} from "@modules/home/variants"
import { buildAlternates } from "@lib/util/alternates"
import { getStorefrontSettings } from "@lib/data/storefront-settings"
import { getTranslations, getLocale } from "next-intl/server"
import { SITE_NAME } from "@lib/util/env"

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([
    getTranslations("Metadata.home"),
    getLocale(),
  ])
  return {
    title: SITE_NAME,
    description: t("description"),
    alternates: buildAlternates(locale, "/"),
  }
}

/**
 * Home = hero, category tiles, product rail — in that order, frame 17 of
 * artifacts/docs/2026-09-07-profile-home-mockup.md. The promo strip is not composed here: it
 * is rendered site-wide by (main)/layout.tsx above the nav, and a second copy on this page
 * would show the same strip twice.
 *
 * The three home slots (hero, tiles, listing) now come from the site-wide composition
 * document, `store.metadata.storefrontSettings` (`2026-09-09-panel-composition-mockup.md`
 * §C1), not straight from `profile.generated.json` — this is the home switch,
 * `getStorefrontSettings()` read ONCE here and passed down as the three slot keys, the way
 * `nav/index.tsx`/`footer/index.tsx` each read it once for their own single slot
 * (`block-port-map.md` §9). No saved settings (§C1 "Absent" row) falls back to the three
 * `DEFAULT_*` constants in `home/variants/index.ts`, which reproduce today's unswitched
 * behaviour exactly: the profile's own hero unaffected, tiles-if-present, the existing
 * product listing — so the `default` profile (no composition ever saved for it) renders
 * identically to before this switch existed.
 */
export default async function Home() {
  const [t, settings] = await Promise.all([
    getTranslations("CategoryMenu"),
    getStorefrontSettings(),
  ])

  const hero = settings?.hero ?? DEFAULT_HERO
  const tiles = settings?.tiles ?? DEFAULT_TILES
  const listing = settings?.listing ?? DEFAULT_LISTING

  const Hero = hero === "none" ? null : HERO_VARIANTS[hero] ?? HERO_VARIANTS[DEFAULT_HERO]
  const Listing =
    listing === "none" ? null : LISTING_VARIANTS[listing] ?? LISTING_VARIANTS[DEFAULT_LISTING]

  return (
    <>
      {Hero ? <Hero /> : null}
      {tiles === "on" ? <CategoryTiles heading={t("title")} /> : null}
      {Listing ? (
        <div className="py-12">
          <ul className="flex flex-col gap-x-6">
            <Suspense
              fallback={
                <li className="content-container py-12 small:py-24">
                  <SkeletonProductGrid numberOfProducts={4} />
                </li>
              }
            >
              <Listing />
            </Suspense>
          </ul>
        </div>
      ) : null}
    </>
  )
}
