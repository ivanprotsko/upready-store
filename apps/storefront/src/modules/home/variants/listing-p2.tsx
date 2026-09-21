import { getTranslations } from "next-intl/server"

import { getHomeRegion, resolveHomeListing } from "@lib/data/home"
import type { HomeListingProps } from "@modules/home/variants/types"
import ListingSection from "@modules/home/components/listing-section"

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

  // Six columns of cropped minis are gone: the section draws the catalog's own grid and
  // card (`ListingSection`), so a photo is whole and a row is even here too.
  return (
    <ListingSection
      heading={heading ?? t("p2.heading", { count })}
      href="/store"
      linkLabel={t("seeAll")}
      products={products}
      data-testid="home-listing-p2"
    />
  )
}
