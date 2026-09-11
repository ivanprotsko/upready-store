import Image from "next/image"

import { Link } from "@i18n/navigation"
import type { HttpTypes } from "@medusajs/types"

import styles from "@modules/home/components/category-tiles/category-tiles.module.css"

function categoryImage(category: HttpTypes.StoreProductCategory) {
  const meta = (category.metadata ?? {}) as Record<string, unknown>
  const url = typeof meta.image_url === "string" && meta.image_url.trim() ? meta.image_url : null
  const alt = typeof meta.image_alt === "string" ? meta.image_alt : ""
  return { url, alt }
}

/**
 * A category's own children, as image tiles — the live-data counterpart of
 * `@modules/home/components/category-tiles` (which draws from the build
 * profile's static config, not a tenant's own categories). Reuses that
 * component's CSS module so the hover/frame treatment matches exactly.
 *
 * The image comes from `product_category.metadata.image_url` (t-2026-09-12,
 * W3 of mt-storefront-by-host — the decision and its reasoning are written
 * once, in `@lib/data/categories.ts` and the tenant panel's
 * `edit-category-form.tsx`, not repeated here). A child with none renders the
 * SAME neutral `bg-ui-bg-subtle` frame `CategoryTiles` renders for a missing
 * profile tile — a deliberate empty state, never a broken `<img>` and never
 * silently blank markup (rule 18f: this must be SEEN, not assumed).
 */
export default function CategoryChildTiles({
  categories,
  heading,
}: {
  categories: HttpTypes.StoreProductCategory[]
  heading?: string
}) {
  if (!categories.length) {
    return null
  }

  const columns = categories.length === 4 ? "small:grid-cols-4" : "small:grid-cols-3"

  return (
    <section className="mb-8" data-testid="category-child-tiles">
      {heading ? (
        <h2 className="mb-4 text-lg font-semibold tracking-[-0.02em] text-ui-fg-base small:mb-6 small:text-xl">
          {heading}
        </h2>
      ) : null}
      <ul className={`grid grid-cols-2 gap-3 small:gap-6 ${columns}`}>
        {categories.map((category) => {
          const { url, alt } = categoryImage(category)

          return (
            <li key={category.id}>
              <Link
                href={`/categories/${category.handle}`}
                data-testid="category-child-tile"
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
                      sizes="(max-width: 1024px) 50vw, 25vw"
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
