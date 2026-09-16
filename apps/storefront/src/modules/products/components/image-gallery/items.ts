/**
 * Pure helpers of the product-page gallery, kept out of the component so the
 * navigation contract can be tested without a DOM (this storefront's vitest
 * runs on node, with no jsdom and no testing-library).
 *
 * Ported from the chrxnasdmds storefront
 * (`src/modules/products/components/image-gallery/items.ts`), whose own suite
 * is what names these behaviours as contractual: wrap-around navigation, a
 * swipe threshold in pixels, and a signature that resets the active slide when
 * the image list itself changes.
 */
import type { HttpTypes } from "@medusajs/types"

export type GalleryItem = { id: string; url: string }

/** Images with a usable URL, in the order the backend ranked them. */
export function buildItems(
  images: HttpTypes.StoreProductImage[]
): GalleryItem[] {
  return images
    .filter((image) => !!image.url)
    .map((image) => ({ id: image.id, url: image.url as string }))
}

/** Stable signature used as the React `key`, so a variant swap starts at slide 1. */
export function itemsSignature(items: GalleryItem[]): string {
  return items.map((item) => item.id).join("|")
}

/** Whether a horizontal drag delta crosses the swipe threshold. */
export function isSwipe(dx: number, threshold = 40): boolean {
  return Math.abs(dx) > threshold
}

/** Direction (-1 previous, +1 next, 0 no move) implied by a swipe delta. */
export function swipeDirection(dx: number, threshold = 40): -1 | 0 | 1 {
  if (!isSwipe(dx, threshold)) {
    return 0
  }
  return dx < 0 ? 1 : -1
}

/** Next/previous index, wrapping around at both ends. */
export function wrapIndex(
  current: number,
  delta: number,
  total: number
): number {
  if (total <= 0) {
    return 0
  }
  return (((current + delta) % total) + total) % total
}

/**
 * Aspect ratio of the hero box, as `{ w, h }`.
 *
 * The product carries its first image's ratio in `metadata.aspect_ratio`
 * ("3/4", "1:1"). A fixed box is what keeps the page from jumping while the
 * photo loads, so an absent or malformed value falls back to 3/4 rather than
 * to no ratio at all.
 */
export function parseAspect(ratio?: string): { w: number; h: number } {
  if (ratio) {
    const match = ratio.match(/^(\d+)\s*[/:]\s*(\d+)$/)
    if (match) {
      const w = Number(match[1])
      const h = Number(match[2])
      if (w > 0 && h > 0) {
        return { w, h }
      }
    }
  }
  return { w: 3, h: 4 }
}

/**
 * Indices worth warming when slide `index` is shown: the two neighbours, so a
 * click on "next" paints from cache. Never the active one (it is already
 * loading) and never a duplicate on a one or two image product.
 */
export function neighbourIndexes(index: number, total: number): number[] {
  if (total <= 1) {
    return []
  }
  const next = wrapIndex(index, +1, total)
  const previous = wrapIndex(index, -1, total)
  return next === previous ? [next] : [next, previous]
}
