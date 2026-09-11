import { getTranslations } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { getHomeRegion, resolveHomeListing } from "@lib/data/home"
import type { HomeListingProps } from "@modules/home/variants/types"
import ProductCard from "@modules/home/components/product-card"

/** small:grid-cols-N, N = min(product count, 4) — a short lead collection never leaves an
 *  empty column (the plan's own acceptance line). Tailwind needs the literal class name
 *  present in source, so this is a lookup, not a template string. */
const SMALL_COLS: Record<number, string> = {
  1: "small:grid-cols-1",
  2: "small:grid-cols-2",
  3: "small:grid-cols-3",
  4: "small:grid-cols-4",
}

/**
 * P1 · Grid of 4 (`composer/lib/blocks.js` `key === "p1"`, `blocks.css` `.grid`). One
 * collection heading with "See all", a 4-column grid of 8 products, full caption (title,
 * subtitle, price) — "the storefront's baseline" per the composer's own comment
 * (`blocks.js:91`), and NOT what `FeaturedProducts`/`ProductRail` renders today
 * (block-port-map.md §6: that component stacks one rail per collection, not one grid of
 * the lead collection).
 *
 * Returns a single `<li>`: `(main)/page.tsx` renders every listing variant inside one
 * `<ul>`, the shape `ProductRail` (today's P1 placeholder) already assumes.
 */
export default async function ListingP1({ products: source }: HomeListingProps = {}) {
  const [t, region] = await Promise.all([
    getTranslations("HomeListing"),
    getHomeRegion(),
  ])

  if (!region) {
    return null
  }

  // tenant panel wave 2, piece 8: `source` is `content.products` of the tenant's home-page
  // document. Absent or "popular" = the lead collection, exactly as before.
  const block = await resolveHomeListing({ source, region, limit: 8, scope: "lead" })
  if (!block) {
    return null
  }
  const { products, heading, href } = block

  const cols = SMALL_COLS[Math.min(products.length, 4)] ?? SMALL_COLS[4]

  return (
    <li className="content-container py-12 small:py-24" data-testid="home-listing-p1">
      <div className="mb-6 flex items-baseline justify-between gap-4 small:mb-8">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-ui-fg-base small:text-xl">
          {heading}
        </h2>
        {href ? (
          <Link
            href={href}
            className="flex shrink-0 items-center gap-1 text-sm font-medium text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
          >
            {t("seeAll")}
          </Link>
        ) : null}
      </div>
      <ul className={`grid grid-cols-2 gap-x-4 gap-y-8 ${cols} small:gap-x-6`}>
        {products.map((product, i) => (
          <li key={product.id}>
            <ProductCard product={product} region={region} meta="full" priority={i < 4} />
          </li>
        ))}
      </ul>
    </li>
  )
}
