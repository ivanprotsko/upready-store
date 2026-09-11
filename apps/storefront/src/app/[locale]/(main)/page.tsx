import type { Metadata } from "next"
import { Fragment, Suspense } from "react"

import CategoryTiles from "@modules/home/components/category-tiles"
import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import {
  DEFAULT_BLOCK_ORDER,
  DEFAULT_HERO,
  DEFAULT_LISTING,
  DEFAULT_TILES,
  HERO_VARIANTS,
  LISTING_VARIANTS,
  type HomeBlockKey,
} from "@modules/home/variants"
import type { HomeHeroProps } from "@modules/home/variants/types"
import { buildAlternates } from "@lib/util/alternates"
import { getEffectiveSettings, getTenantHome } from "@lib/data/tenant-home"
import { getTranslations, getLocale } from "next-intl/server"
import { getSiteName } from "@lib/data/cookies"

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale, siteName] = await Promise.all([
    getTranslations("Metadata.home"),
    getLocale(),
    getSiteName(),
  ])
  return {
    title: siteName,
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
 * `getEffectiveSettings()` read ONCE here and passed down as the three slot keys, the way
 * `nav/index.tsx`/`footer/index.tsx` each read it once for their own single slot
 * (`block-port-map.md` §9). No saved settings (§C1 "Absent" row) falls back to the three
 * `DEFAULT_*` constants in `home/variants/index.ts`, which reproduce today's unswitched
 * behaviour exactly: the profile's own hero unaffected, tiles-if-present, the existing
 * product listing — so the `default` profile (no composition ever saved for it) renders
 * identically to before this switch existed.
 *
 * Tenant panel wave 2, piece 8: when this storefront's publishable key has a tenant behind
 * it and that tenant saved a home-page document (`upready.tenant-home/v1`), the document
 * decides three more things on top of the composition it already carries — the hero's own
 * copy (`content.hero`), which products the listing shows (`content.products`) and the
 * order the three blocks render in (`content.order`, a block left out of it is not
 * rendered). Without a document every one of those is `undefined` and each block keeps
 * its own behaviour, which is the state of the five old stands.
 */
export default async function Home() {
  // Piece 9: one process serves every shop, so both reads below are per REQUEST — the
  // publishable key they travel with comes from the `Host` header
  // (`lib/data/tenant-home.ts`, `lib/config.ts`). `getEffectiveSettings()` is already
  // "this shop's document, else the site-wide one", which is why there is no second
  // fallback here; a single-store deployment resolves no shop and reads exactly what it
  // read before either piece existed.
  const [t, settings, home] = await Promise.all([
    getTranslations("CategoryMenu"),
    getEffectiveSettings(),
    getTenantHome(),
  ])

  const hero = settings?.hero ?? DEFAULT_HERO
  const tiles = settings?.tiles ?? DEFAULT_TILES
  const listing = settings?.listing ?? DEFAULT_LISTING

  const Hero = hero === "none" ? null : HERO_VARIANTS[hero] ?? HERO_VARIANTS[DEFAULT_HERO]
  const Listing =
    listing === "none" ? null : LISTING_VARIANTS[listing] ?? LISTING_VARIANTS[DEFAULT_LISTING]

  // An empty string in the document means "the tenant left this field blank", which is the
  // same thing as "not set" for every hero: each falls back to its own copy per field.
  const heroContent = home?.content.hero
  const heroProps: HomeHeroProps = heroContent
    ? {
        title: heroContent.title || null,
        subtitle: heroContent.subtitle || null,
        ctaLabel: heroContent.cta_label || null,
        ctaHref: heroContent.cta_href || null,
        imageUrl: heroContent.image_url || null,
      }
    : {}

  const order: readonly HomeBlockKey[] = home?.content.order?.length
    ? home.content.order
    : DEFAULT_BLOCK_ORDER

  const blocks: Record<HomeBlockKey, React.ReactNode> = {
    hero: Hero ? <Hero {...heroProps} /> : null,
    categories: tiles === "on" ? <CategoryTiles heading={t("title")} /> : null,
    products: Listing ? (
      <div className="py-12">
        <ul className="flex flex-col gap-x-6">
          <Suspense
            fallback={
              <li className="content-container py-12 small:py-24">
                <SkeletonProductGrid numberOfProducts={4} />
              </li>
            }
          >
            <Listing products={home?.content.products} />
          </Suspense>
        </ul>
      </div>
    ) : null,
  }

  return (
    <>
      {order.map((block) => (
        <Fragment key={block}>{blocks[block]}</Fragment>
      ))}
    </>
  )
}
