import Image from "next/image"

import { Link } from "@i18n/navigation"
import type { HttpTypes } from "@medusajs/types"
import { categoryImage } from "@lib/util/category-image"

import styles from "@modules/home/components/category-tiles/category-tiles.module.css"

/**
 * A list of categories drawn as image tiles, from LIVE tenant data — the
 * counterpart of `@modules/home/components/category-tiles`, which draws the build
 * profile's static config instead. Reuses that component's CSS module so the
 * hover/frame treatment matches exactly.
 *
 * Two call sites, both of them a place "the storefront shows this category"
 * (f16-category-image-not-shown): the children of the category being viewed
 * (`@modules/categories/templates`) and the catalog's own strip
 * (`@modules/store/templates`). It was `category-child-tiles` while the first was
 * the only one.
 *
 * The picture comes from `product_category.metadata.image_url`, read through the
 * one reader in `@lib/util/category-image`. A category with none renders the SAME
 * neutral `bg-ui-bg-subtle` frame `CategoryTiles` renders for a missing profile
 * tile — a deliberate empty state, never a broken `<img>` and never silently blank
 * markup (rule 18f: this must be SEEN, not assumed).
 */
export default function CategoryImageTiles({
  categories,
  heading,
  dense = false,
}: {
  categories: HttpTypes.StoreProductCategory[]
  heading?: string
  /**
   * A navigation strip rather than a block: six across instead of three, so a shop
   * with one pictured category gets a thumbnail above its catalog and not a single
   * hero-sized square where the products should be (measured on the stand at
   * 1280x900 before this prop existed).
   */
  dense?: boolean
}) {
  if (!categories.length) {
    return null
  }

  const columns = dense
    ? "grid-cols-3 small:grid-cols-6"
    : `grid-cols-2 ${categories.length === 4 ? "small:grid-cols-4" : "small:grid-cols-3"}`

  return (
    <section className="mb-8" data-testid="category-image-tiles">
      {heading ? (
        <h2 className="mb-4 text-lg font-semibold tracking-[-0.02em] text-ui-fg-base small:mb-6 small:text-xl">
          {heading}
        </h2>
      ) : null}
      <ul className={`grid gap-3 small:gap-6 ${columns}`}>
        {categories.map((category) => {
          const { url, alt } = categoryImage(category)

          return (
            <li key={category.id}>
              <Link
                href={`/categories/${category.handle}`}
                data-testid="category-image-tile"
                data-category-handle={category.handle}
                className={`${styles.tile} group block overflow-hidden rounded-lg border border-ui-border-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-border-interactive focus-visible:ring-2 focus-visible:ring-[var(--ring)]`}
              >
                <div className="relative aspect-[4/5] w-full overflow-hidden bg-ui-bg-subtle">
                  {url ? (
                    <Image
                      src={url}
                      alt={alt}
                      fill
                      quality={60}
                      sizes={dense ? "(max-width: 1024px) 33vw, 16vw" : "(max-width: 1024px) 50vw, 25vw"}
                      draggable={false}
                      className={styles.image}
                    />
                  ) : null}
                </div>
                <div className="flex items-center justify-between gap-2 px-3 py-3">
                  <span className="truncate text-[13px] font-medium text-ui-fg-base small:text-sm">
                    {category.name}
                  </span>
                  <span aria-hidden className={styles.arrow}>
                    &rarr;
                  </span>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
