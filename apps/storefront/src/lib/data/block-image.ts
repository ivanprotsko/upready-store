"use server"

import { DEFAULT_REGION } from "@lib/util/env"
import { categoryImage } from "@lib/util/category-image"
import type { ImageRef } from "@modules/blocks/shared/image-ref"
import { pickText } from "@modules/blocks/shared/localized-text"

import { getCategoryByHandle } from "./categories"
import { getCountryCode } from "./cookies"
import { listProducts } from "./products"

/**
 * A block's picture, ready for `next/image` (t-2026-10-12-33, BLOCK-CONTRACT.md §3). `width` and
 * `height` are null when the source does not know them, which is every source today: Medusa
 * keeps no dimensions for product or category pictures. A block draws the picture in a box of
 * its own ratio (`--layer-photo-aspect`) with `fill`.
 */
export type BlockImage = { url: string; alt: string; width: number | null; height: number | null }

/**
 * Turns an `ImageRef` of a template into an address, read through the same loaders the shop's
 * pages use, so the tenant scoping and the caches are theirs. Null when the product or the
 * category is not in this shop, has no such picture, or the read fails: the block then shows
 * its empty state instead of a broken image.
 */
export async function resolveImageRef(ref: ImageRef, locale: string): Promise<BlockImage | null> {
  const ownAlt = pickText(ref.alt, locale)
  try {
    if ("src" in ref) {
      return { url: ref.src, alt: ownAlt ?? "", width: null, height: null }
    }
    if ("category" in ref) {
      const category = await getCategoryByHandle([ref.category])
      if (!category) return null
      const image = categoryImage(category)
      if (!image.url) return null
      return { url: image.url, alt: ownAlt ?? (image.alt || category.name), width: null, height: null }
    }
    const { response } = await listProducts({
      countryCode: (await getCountryCode()) ?? DEFAULT_REGION,
      queryParams: { handle: ref.product, limit: 1, fields: "id,handle,title,thumbnail,*images" },
    })
    const product = response.products.find((candidate) => candidate.handle === ref.product)
    if (!product) return null
    const images = [...(product.images ?? [])].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    const url = images[ref.index]?.url ?? (ref.index === 0 ? product.thumbnail : null)
    if (!url) return null
    return { url, alt: ownAlt ?? product.title ?? "", width: null, height: null }
  } catch {
    return null
  }
}
