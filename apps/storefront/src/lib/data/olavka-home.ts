"use server"

import { listCategories } from "./categories"
import { getHomeRegion } from "./home"
import { listProducts } from "./products"
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

/** How many category slides the slider shows. */
const CATEGORY_SLIDES = 3

/**
 * Slides for the hero slider — see `OlavkaHeroSlide`'s TODO: assembled from real tenant
 * data, never invented copy. The first `CATEGORY_SLIDES` top-level categories, each
 * illustrated by the thumbnail of one of its own products (the tenant's categories carry
 * no `image_url` today — measured on stand `cherkashino`, 2026-09-24). A category with no
 * photographed product still makes a slide, with no image.
 *
 * The tenant's own hero is NOT a slide: the Cover block above the slider already shows it,
 * and the same promo twice on one screen was the first thing Ivan noticed (2026-09-24).
 */
export async function getOlavkaHeroSlides(): Promise<OlavkaHeroSlide[]> {
  const [region, nav] = await Promise.all([getHomeRegion(), getOlavkaNavItems()])

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

  return picked.map((item, index) => ({
    id: item.handle,
    source: "category",
    title: item.name,
    subtitle: null,
    ctaLabel: null,
    ctaHref: `/categories/${item.handle}`,
    image: item.image ?? thumbnails[index],
  }))
}
