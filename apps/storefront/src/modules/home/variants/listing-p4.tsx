import { getTranslations } from "next-intl/server"

import { getHomeRegion, resolveHomeListing } from "@lib/data/home"
import type { HomeListingProps } from "@modules/home/variants/types"
import ListingSection from "@modules/home/components/listing-section"

/**
 * P4 · Wall. Twelve products across the whole catalog (`group: "flat"`) under the shop's
 * own heading, with the way into the full catalog on the right.
 *
 * It used to be a CSS-columns masonry of `object-cover` tiles at three rotating heights
 * (440/300/360 px), ported from the composer mock. On a real shop that cut the caption
 * off every marketplace photo and made no two rows line up, so the wall is now the
 * catalog's own grid and card (`ListingSection`): whole photos in one frame, even rows.
 */
export default async function ListingP4({ products: source }: HomeListingProps = {}) {
  const [t, tStore, region] = await Promise.all([
    getTranslations("HomeListing"),
    getTranslations("Store"),
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
  const { products, heading, href } = block

  return (
    <ListingSection
      heading={heading ?? t("p4.heading")}
      href={href ?? "/store"}
      linkLabel={href ? t("seeAll") : tStore("allProducts")}
      products={products}
      data-testid="home-listing-p4"
    />
  )
}
