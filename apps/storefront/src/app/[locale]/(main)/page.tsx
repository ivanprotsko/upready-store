import type { Metadata } from "next"
import { Fragment, Suspense } from "react"

import CategoryTiles from "@modules/home/components/category-tiles"
import HomeBrands from "@modules/home/components/home-brands"
import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import {
  DEFAULT_BLOCK_ORDER,
  DEFAULT_HERO,
  DEFAULT_LISTING,
  DEFAULT_TILES,
  OLAVKA_HOME_BLOCKS,
  OLAVKA_HOME_ORDER,
  HERO_VARIANTS,
  LISTING_VARIANTS,
  type HomeBlockKey,
} from "@modules/home/variants"
import type { HomeHeroProps } from "@modules/home/variants/types"
import { buildAlternates } from "@lib/util/alternates"
import { isOlavkaShop } from "@lib/data/olavka-shop"
import { getEffectiveSettings, getTenantHome, type TenantHome } from "@lib/data/tenant-home"
import { heroIsDrawn, homeBlockOrder, homeDescription } from "@lib/util/home-description"
import { localizedHero } from "@lib/util/localized-hero"
import { getTranslations, getLocale } from "next-intl/server"
import { getSiteName } from "@lib/data/cookies"
import { listCategories } from "@lib/data/categories"
import { categoriesWithImages, categoryImage } from "@lib/util/category-image"
import { categoryTiles as profileCategoryTiles } from "@lib/profile"
import type { ProfileCategoryTile } from "@lib/profile/types"
import { HOME_SECTION_CLASS } from "@modules/home/components/listing-section"

/**
 * The category tiles THIS shop may show. The list in the build profile belongs to the
 * profile the image was built from, and on the shared engine that is another shop's
 * goods: a tenant created through the onboarding wizard opened with four photographs of
 * sneakers over links into a catalog it does not have (measured on
 * https://nochlavka.shipshift.dev, 2026-09-12) — worse than the empty shop the final
 * onboarding screen honestly promises.
 *
 * So a tile is kept only when this shop really owns that category. `listCategories()` is
 * already tenant-scoped (it travels with the key the Host resolved), so a single-store
 * stand keeps every tile it kept before — its own categories are the ones the profile
 * names — and any tile that survives is a link that resolves rather than a 404 dressed as
 * a photograph.
 *
 * A failed read is not an empty catalog (rule 20a): the profile's own list is returned
 * unchanged and the reason is written to the server log, because blanking the block on a
 * network blip would look exactly like a shop that has no categories.
 */
async function tilesForThisShop(): Promise<readonly ProfileCategoryTile[]> {
  try {
    const categories = await listCategories({
      fields: "id,handle,name,rank,metadata,parent_category_id,*category_children",
    })

    // A shop's OWN pictures first (t-2026-09-12-catalog-taxonomy): a tenant seeded with the
    // starter catalog, or one whose owner gave a category an image in the panel, has
    // categories carrying `metadata.image_url` — those are its tiles, in the category order,
    // at most six (the tile grid's own limit). The build profile's list cannot know them.
    //
    // ONE picture is enough. This block used to hold out for three and fall back to the
    // build profile's foreign list below that, so an owner who uploaded a single photograph
    // saw her home page unchanged and was told nothing anywhere — the defect
    // f16-category-image-not-shown was opened on. The leaf rule and the order live in
    // `@lib/util/category-image` now, shared with the catalog strip.
    const own = categoriesWithImages(categories, 6).map((category) => ({
      categoryHandle: category.handle as string,
      label: category.name,
      image: categoryImage(category).url as string,
    }))

    if (own.length) {
      return own
    }

    if (!profileCategoryTiles.length) {
      return profileCategoryTiles
    }

    const owned = new Set(
      categories.map((category) => category.handle).filter(Boolean) as string[]
    )

    return profileCategoryTiles.filter((tile) => owned.has(tile.categoryHandle))
  } catch (error) {
    console.warn(
      "[home] category tiles: could not read this shop's categories, falling back to the " +
        "build profile's whole list — the tiles below may belong to another shop.",
      error
    )
    return profileCategoryTiles
  }
}

/** The block order the shop saved, or the default one for a shop that saved none. */
const savedBlockOrder = (home: TenantHome | null): readonly HomeBlockKey[] =>
  home?.content.order?.length ? home.content.order : DEFAULT_BLOCK_ORDER

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale, siteName, settings, home, olavka] = await Promise.all([
    getTranslations("Metadata.home"),
    getLocale(),
    getSiteName(),
    getEffectiveSettings(),
    getTenantHome(),
    isOlavkaShop(),
  ])
  return {
    title: siteName,
    // The hero's text only when the page below draws the hero: `heroIsDrawn` is the
    // same rule `Home` renders by, so a shop that switched the block off does not get
    // its text back in a search result.
    description: homeDescription({
      olavka,
      hero: settings?.hero ?? DEFAULT_HERO,
      savedOrder: savedBlockOrder(home),
      subtitle: localizedHero(home?.content.hero, locale)?.subtitle,
      neutral: t("description"),
    }),
    alternates: await buildAlternates(locale, "/"),
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
  const [t, settings, home, tileList, locale, olavka] = await Promise.all([
    getTranslations("CategoryMenu"),
    getEffectiveSettings(),
    getTenantHome(),
    tilesForThisShop(),
    getLocale(),
    isOlavkaShop(),
  ])

  const hero = settings?.hero ?? DEFAULT_HERO
  const tiles = settings?.tiles ?? DEFAULT_TILES
  const listing = settings?.listing ?? DEFAULT_LISTING

  const Hero = hero === "none" ? null : HERO_VARIANTS[hero] ?? HERO_VARIANTS[DEFAULT_HERO]
  const Listing =
    listing === "none" ? null : LISTING_VARIANTS[listing] ?? LISTING_VARIANTS[DEFAULT_LISTING]

  // An empty string in the document means "the tenant left this field blank", which is the
  // same thing as "not set" for every hero: each falls back to its own copy per field.
  const heroContent = localizedHero(home?.content.hero, locale)
  const heroProps: HomeHeroProps = heroContent
    ? {
        title: heroContent.title || null,
        subtitle: heroContent.subtitle || null,
        ctaLabel: heroContent.cta_label || null,
        ctaHref: heroContent.cta_href || null,
        imageUrl: heroContent.image_url || null,
        profileFallback: false,
      }
    : {}

  const savedOrder = savedBlockOrder(home)
  // The Olavka shop's own blocks above take the hero's place, so the composed hero is
  // skipped for it — Ivan saw three heroes on one page otherwise (2026-09-24). Tiles and
  // listing keep rendering below the new blocks. Every other shop gets the saved order,
  // untouched. The rule lives in `homeBlockOrder`, which `generateMetadata` reads too.
  const order = homeBlockOrder(savedOrder, olavka)

  const blocks: Record<HomeBlockKey, React.ReactNode> = {
    hero: Hero && heroIsDrawn({ olavka, hero, savedOrder }) ? <Hero {...heroProps} /> : null,
    categories:
      tiles === "on" ? <CategoryTiles heading={t("title")} tiles={tileList} /> : null,
    products: Listing ? (
      // No padding of its own: the section's rhythm is `HOME_SECTION_CLASS`, once.
      <div>
        <ul className="flex flex-col gap-x-6">
          <Suspense
            fallback={
              <li className={HOME_SECTION_CLASS}>
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
      {/* The Olavka shop's own Figma blocks first, in Figma order — see `OLAVKA_HOME_ORDER`'s
          own doc comment in `home/variants/index.ts`. The Cover takes the same tenant hero
          copy the composed hero does. Every other shop renders none of these. */}
      {olavka &&
        OLAVKA_HOME_ORDER.map((block) => {
          const Block = OLAVKA_HOME_BLOCKS[block]
          return (
            <Fragment key={block}>
              {block === "olavkaCover" ? <Block {...heroProps} /> : <Block />}
            </Fragment>
          )
        })}
      {order.map((block) => (
        <Fragment key={block}>{blocks[block]}</Fragment>
      ))}
      {/* The shop's brands, when it keeps a `brands` category (ask a0e1); nothing otherwise. */}
      <HomeBrands />
    </>
  )
}
