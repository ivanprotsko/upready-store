import type { Metadata } from "next"
import { Suspense } from "react"

import CategoryTiles from "@modules/home/components/category-tiles"
import FeaturedProducts from "@modules/home/components/featured-products"
import ProfileHero from "@modules/home/components/profile-hero"
import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import { buildAlternates } from "@lib/util/alternates"
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
 * The hero and the tiles come out of profile.generated.json and render nothing when the
 * profile does not carry them, which is what makes the `default` profile identical to the
 * storefront as it stands. The old modules/home/components/hero was disabled in 2d0069e and
 * is deliberately left where it is.
 */
export default async function Home() {
  const t = await getTranslations("CategoryMenu")

  return (
    <>
      <ProfileHero />
      <CategoryTiles heading={t("title")} />
      <div className="py-12">
        <ul className="flex flex-col gap-x-6">
          <Suspense
            fallback={
              <li className="content-container py-12 small:py-24">
                <SkeletonProductGrid numberOfProducts={4} />
              </li>
            }
          >
            <FeaturedProducts />
          </Suspense>
        </ul>
      </div>
    </>
  )
}
