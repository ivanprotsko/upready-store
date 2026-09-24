"use server"

import { getLocale } from "next-intl/server"

import { listCategories } from "./categories"
import { getHomeRegion } from "./home"
import { listProducts } from "./products"
import { getTenantHome } from "./tenant-home"
import { localizedHero } from "@lib/util/localized-hero"
import { categoryImage } from "@lib/util/category-image"
import type { OlavkaHeroSlide, OlavkaNavItem } from "@modules/home/variants/olavka-types"

/**
 * Data for the Olavka redesign home blocks (t-2026-09-24-n15). Every read here is one
 * the storefront already makes elsewhere on the same request (`listCategories`,
 * `getTenantHome`, `listProducts`), so nothing new reaches the backend; the three
 * blocks only recombine what the page already knows.
 */

/** The top-level categories, in the owner's own order (`rank`), for the navigation row. */
export async function getOlavkaNavItems(): Promise<OlavkaNavItem[]> {
  const categories = await listCategories({
    fields: "id,name,handle,rank,parent_category_id,+metadata",
  })
  return categories
    .filter((category) => !category.parent_category_id)
    .map((category) => ({
      id: category.id,
      name: category.name,
      handle: category.handle as string,
      image: categoryImage(category).url ?? null,
    }))
}

/** How many category slides follow the tenant's own hero slide. */
const CATEGORY_SLIDES = 3

/**
 * Slides for the hero slider — see `OlavkaHeroSlide`'s TODO: assembled from real tenant
 * data, never invented copy. Slide 1 is the tenant's hero (its home document, in the
 * visitor's language); the next `CATEGORY_SLIDES` are the first top-level categories,
 * each illustrated by the thumbnail of one of its own products (the tenant's categories
 * carry no `image_url` today — measured on stand `cherkashino`, 2026-09-24). A category
 * with no photographed product still makes a slide, with no image.
 */
export async function getOlavkaHeroSlides(): Promise<OlavkaHeroSlide[]> {
  const [locale, home, region, nav] = await Promise.all([
    getLocale(),
    getTenantHome(),
    getHomeRegion(),
    getOlavkaNavItems(),
  ])

  const slides: OlavkaHeroSlide[] = []

  const hero = localizedHero(home?.content.hero, locale)
  if (hero?.title) {
    slides.push({
      id: "tenant-hero",
      source: "tenant-hero",
      title: hero.title,
      subtitle: hero.subtitle || null,
      ctaLabel: hero.cta_label || null,
      ctaHref: hero.cta_href || null,
      image: hero.image_url || null,
    })
  }

  const picked = nav.slice(0, CATEGORY_SLIDES)
  const thumbnails = region
    ? await Promise.all(
        picked.map((item) =>
          listProducts({
            regionId: region.id,
            queryParams: { category_id: [item.id], limit: 1, fields: "id,thumbnail" },
          })
            .then(({ response }) => response.products[0]?.thumbnail ?? null)
            .catch(() => null)
        )
      )
    : picked.map(() => null)

  picked.forEach((item, index) => {
    slides.push({
      id: item.handle,
      source: "category",
      title: item.name,
      subtitle: null,
      ctaLabel: null,
      ctaHref: `/categories/${item.handle}`,
      image: item.image ?? thumbnails[index],
    })
  })

  return slides
}
