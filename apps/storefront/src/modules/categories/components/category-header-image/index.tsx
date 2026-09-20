import Image from "next/image"

import type { HttpTypes } from "@medusajs/types"
import { categoryImage } from "@lib/util/category-image"

import styles from "@modules/home/components/category-tiles/category-tiles.module.css"

/**
 * The category's OWN picture, on its own page, beside the title
 * (f16-category-image-not-shown). Before this the page drew its children's tiles
 * and never the category the visitor had actually opened, so a shop owner who gave
 * one category a photograph could open that very category and still see nothing.
 *
 * Same 4:5 crop and same frame as the tiles, at a size that sits next to an `h1`
 * rather than pushing the filters off the fold: 64px wide on a phone, 96px from
 * `small` up. A category with no picture renders nothing at all here — the neutral
 * placeholder frame the tiles use would read as a broken header rather than as an
 * empty slot in a grid.
 */
export default function CategoryHeaderImage({
  category,
}: {
  category: HttpTypes.StoreProductCategory
}) {
  const { url, alt } = categoryImage(category)

  if (!url) {
    return null
  }

  return (
    <div
      data-testid="category-header-image"
      className="relative aspect-[4/5] w-16 shrink-0 overflow-hidden rounded-lg border border-ui-border-base bg-ui-bg-subtle small:w-24"
    >
      <Image
        src={url}
        alt={alt}
        fill
        quality={60}
        sizes="96px"
        draggable={false}
        className={styles.image}
      />
    </div>
  )
}
