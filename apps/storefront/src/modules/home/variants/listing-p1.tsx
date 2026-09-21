import { getTranslations } from "next-intl/server"

import { getHomeRegion, resolveHomeListing } from "@lib/data/home"
import type { HomeListingProps } from "@modules/home/variants/types"
import ListingSection from "@modules/home/components/listing-section"

/**
 * P1 · Grid of 4 (`composer/lib/blocks.js` `key === "p1"`, `blocks.css` `.grid`). One
 * collection heading with "See all" and 8 products in the shared product grid — "the storefront's baseline" per the composer's own comment
 * (`blocks.js:91`), and NOT what `FeaturedProducts`/`ProductRail` renders today
 * (block-port-map.md §6: that component stacks one rail per collection, not one grid of
 * the lead collection).
 *
 * Returns a single `<li>`: `(main)/page.tsx` renders every listing variant inside one
 * `<ul>`, the shape `ProductRail` (today's P1 placeholder) already assumes.
 */
export default async function ListingP1({ products: source }: HomeListingProps = {}) {
  const [t, tStore, region] = await Promise.all([
    getTranslations("HomeListing"),
    getTranslations("Store"),
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

  // The grid and the card are the catalog's own (`ListingSection`), so a product looks
  // the same here and on `/store`. With no collection to point at, the link leads to the
  // whole catalog.
  return (
    <ListingSection
      heading={heading ?? t("p4.heading")}
      href={href ?? "/store"}
      linkLabel={href ? t("seeAll") : tStore("allProducts")}
      products={products}
      rows="short"
      data-testid="home-listing-p1"
    />
  )
}
