import Image from "next/image"

import { Link } from "@i18n/navigation"
import { categoryTiles } from "@lib/profile"

import styles from "./category-tiles.module.css"

/**
 * The category grid of home.categoryTiles, drawn as frames 5-9 of
 * artifacts/docs/2026-09-07-profile-home-mockup.md.
 *
 * Column rule, one place: 4 tiles take 4 columns, every other count (3, 5, 6) takes 3, and
 * below 1024px it is always 2. A short last row stays left-aligned — a stretched orphan row
 * is what makes a grid look broken.
 *
 * Tiles keep a fixed 4:5 crop. layout.imageTreatment governs product images, not navigation
 * art, so a profile cannot make its tiles disagree with each other.
 *
 * Pure server component: it takes its heading as a prop rather than calling next-intl, so
 * nothing in this file reaches the request context.
 */
export default function CategoryTiles({ heading }: { heading?: string }) {
  if (!categoryTiles.length) {
    return null
  }

  const columns = categoryTiles.length === 4 ? "small:grid-cols-4" : "small:grid-cols-3"

  return (
    <section className="content-container py-12 small:py-16" data-testid="category-tiles">
      {heading ? (
        <h2 className="mb-4 text-lg font-semibold tracking-[-0.02em] text-ui-fg-base small:mb-6 small:text-xl">
          {heading}
        </h2>
      ) : null}
      <ul className={`grid grid-cols-2 gap-3 small:gap-6 ${columns}`}>
        {categoryTiles.map((tile) => (
          <li key={tile.categoryHandle}>
            <Link
              href={`/categories/${tile.categoryHandle}`}
              data-testid="category-tile"
              data-category-handle={tile.categoryHandle}
              className={`${styles.tile} group block overflow-hidden rounded-lg border border-ui-border-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-border-interactive focus-visible:ring-2 focus-visible:ring-[var(--ring)]`}
            >
              <div className="relative aspect-[4/5] w-full overflow-hidden bg-ui-bg-subtle">
                {tile.image ? (
                  <Image
                    src={tile.image}
                    alt=""
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
                  {tile.label}
                </span>
                <span aria-hidden className={styles.arrow}>
                  &rarr;
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
