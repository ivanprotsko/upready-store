import { getTranslations } from "next-intl/server"

import { getHomeRegion, resolveHomeListing } from "@lib/data/home"
import type { HomeListingProps } from "@modules/home/variants/types"
import ProductCard from "@modules/home/components/product-card"

/** small:grid-cols-N, N = min(product count, 6) — same "no empty column" rule as P1. */
const SMALL_COLS: Record<number, string> = {
  1: "small:grid-cols-1",
  2: "small:grid-cols-2",
  3: "small:grid-cols-3",
  4: "small:grid-cols-4",
  5: "small:grid-cols-5",
  6: "small:grid-cols-6",
}

/**
 * P2 · Dense 6 (`composer/lib/blocks.js` `key === "p2"`, `blocks.css` `.card-p.min`). Sells
 * catalog width: 12 items across the whole store (not scoped to a collection —
 * `group: "flat"`), a 6-column grid, caption cut to title and price only. The heading
 * names the store's real total product count, not the 12 rendered.
 *
 * Returns a single `<li>`, the shape every listing variant shares under `(main)/page.tsx`'s
 * `<ul>`.
 */
export default async function ListingP2({ products: source }: HomeListingProps = {}) {
  const [t, region] = await Promise.all([
    getTranslations("HomeListing"),
    getHomeRegion(),
  ])

  if (!region) {
    return null
  }

  // tenant panel wave 2, piece 8: `source` is `content.products` of the tenant's home-page
  // document. Absent or "popular" keeps this variant's own behaviour.
  const block = await resolveHomeListing({ source, region, limit: 12, scope: "catalog" })
  if (!block) {
    return null
  }
  const { products, count, heading } = block

  const cols = SMALL_COLS[Math.min(products.length, 6)] ?? SMALL_COLS[6]

  return (
    <li className="content-container py-12 small:py-24" data-testid="home-listing-p2">
      <h2 className="mb-6 text-lg font-semibold tracking-[-0.02em] text-ui-fg-base small:mb-8 small:text-xl">
        {heading ?? t("p2.heading", { count })}
      </h2>
      <ul className={`grid grid-cols-3 gap-x-3 gap-y-6 ${cols} small:gap-x-4`}>
        {products.map((product, i) => (
          <li key={product.id}>
            <ProductCard product={product} region={region} meta="min" priority={i < 6} />
          </li>
        ))}
      </ul>
    </li>
  )
}
