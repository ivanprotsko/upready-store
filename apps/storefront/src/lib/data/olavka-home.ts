"use server"

import type { HttpTypes } from "@medusajs/types"
import { getLocale, getTranslations } from "next-intl/server"

import { listCategories } from "./categories"
import { getHomeRegion } from "./home"
import { listProducts } from "./products"
import { getTenantHome } from "./tenant-home"
import { localizedBanner } from "@lib/util/localized-banner"
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

/** At most this many course slides in the fallback; the node shows two banners. */
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

const isExternal = (href: string) => /^https?:\/\//i.test(href)

/** The tenant's saved banners as slides, in `sort` order and in the page's language
 *  (`localizedBanner`) — or null when none is saved. */
async function bannerSlides(): Promise<OlavkaHeroSlide[] | null> {
  const [home, locale] = await Promise.all([getTenantHome(), getLocale()])
  const banners = home?.content.banners ?? []
  if (!banners.length) {
    return null
  }

  return [...banners]
    .sort((a, b) => a.sort - b.sort)
    .map((banner) => localizedBanner(banner, locale))
    .map((banner) => {
      const href =
        banner.link.type === "product"
          ? banner.link.handle
            ? `/products/${banner.link.handle}`
            : "/store"
          : banner.link.href
      return {
        id: banner.id,
        source: "banner",
        kicker: banner.kicker || null,
        label: banner.label || null,
        title: banner.title,
        button: banner.button || null,
        image: banner.image.src
          ? {
              src: banner.image.src,
              alt: banner.image.alt ?? "",
              srcSet: banner.image.srcset?.length
                ? banner.image.srcset.map((v) => `${v.url} ${v.w}w`).join(", ")
                : null,
              width: banner.image.width ?? null,
              height: banner.image.height ?? null,
            }
          : null,
        href,
        external: banner.link.type === "url" && isExternal(href),
      }
    })
}

/** The fallback: the tenant's course products, newest catalog order, each with its
 *  cover (`metadata.cover.src`) or thumbnail. Real tenant data, never invented copy. */
async function courseSlides(): Promise<OlavkaHeroSlide[]> {
  const [t, region] = await Promise.all([getTranslations("OlavkaHome.slider"), getHomeRegion()])
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
      const src = cover ?? product.thumbnail ?? null
      return {
        id: product.handle as string,
        source: "course",
        kicker: null,
        label: t("course"),
        title: product.title,
        button: t("watch"),
        image: src
          ? {
              src,
              alt: typeof meta.cover?.alt === "string" ? meta.cover.alt : "",
              srcSet: null,
              width: null,
              height: null,
            }
          : null,
        href: `/products/${product.handle}`,
        external: false,
      }
    })
}

/**
 * Slides for the HeroSliders block: the tenant's banners (`content.banners`, the panel's
 * «Баннеры на главной», t-2026-09-24-n15) when any are saved, else the course fallback.
 */
export async function getOlavkaHeroSlides(): Promise<OlavkaHeroSlide[]> {
  return (await bannerSlides()) ?? courseSlides()
}
