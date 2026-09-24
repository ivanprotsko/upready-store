"use server"

import type { HttpTypes } from "@medusajs/types"

import { listCategories } from "./categories"
import { getHomeRegion } from "./home"
import { listProducts } from "./products"
import type { OlavkaHeroSlide, OlavkaNavItem } from "@modules/home/variants/olavka-types"

/**
 * Data for the Olavka redesign home blocks (t-2026-09-24-n15). Every read here is one
 * the storefront already makes elsewhere on the same request (`listCategories`,
 * `listProducts`), so nothing new reaches the backend; the blocks only recombine what
 * the page already knows.
 */

/**
 * The top-level categories for the navigation row, in alphabetical order — the order
 * Figma 227:9297 «Navigation» lists them in (Антисептики … Фито-свечи), not the owner's
 * `rank`, which the header menus keep.
 */
export async function getOlavkaNavItems(): Promise<OlavkaNavItem[]> {
  const categories = await listCategories({
    fields: "id,name,handle,rank,parent_category_id",
  })
  return categories
    .filter((category) => !category.parent_category_id)
    .map((category) => ({
      id: category.id,
      name: category.name,
      handle: category.handle as string,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"))
}

/** At most this many course slides; the node shows three banners. */
const MAX_SLIDES = 6

type CourseMetadata = {
  digital?: unknown
  course_page?: unknown
  cover?: { src?: unknown; alt?: unknown } | null
}

/** A product the courses feature (PR #152) sells as a course: `metadata.digital`. */
const isCourse = (product: HttpTypes.StoreProduct): boolean => {
  const meta = (product.metadata ?? {}) as CourseMetadata
  return meta.digital === true || meta.digital === "true" || Boolean(meta.course_page)
}

/**
 * Slides for the hero slider: the tenant's course products, newest catalog order, each
 * with its cover (`metadata.cover.src`, the course page's own hero) or thumbnail. Real
 * tenant data, never invented copy; see `OlavkaHeroSlide` for the fields the node draws
 * that have no data yet.
 */
export async function getOlavkaHeroSlides(): Promise<OlavkaHeroSlide[]> {
  const region = await getHomeRegion()
  if (!region) {
    return []
  }

  const { response } = await listProducts({
    regionId: region.id,
    queryParams: { limit: 50, fields: "id,title,handle,thumbnail,+metadata" },
  }).catch(() => ({ response: { products: [] as HttpTypes.StoreProduct[], count: 0 } }))

  return response.products
    .filter(isCourse)
    .slice(0, MAX_SLIDES)
    .map((product) => {
      const meta = (product.metadata ?? {}) as CourseMetadata
      const cover = typeof meta.cover?.src === "string" ? meta.cover.src : null
      return {
        id: product.handle as string,
        source: "course",
        title: product.title,
        kicker: null,
        image: cover ?? product.thumbnail ?? null,
        imageAlt: typeof meta.cover?.alt === "string" ? meta.cover.alt : "",
        href: `/products/${product.handle}`,
      }
    })
}
