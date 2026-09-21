import { getLocale, getTranslations } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { getProductPrice } from "@lib/util/get-product-price"
import { getHomeRegion, resolveHomeListing } from "@lib/data/home"
import type { HomeListingProps } from "@modules/home/variants/types"
import AddToBagButton from "@modules/home/components/add-to-bag-button"
import { HOME_SECTION_CLASS, ListingSectionHeader } from "@modules/home/components/listing-section"
import ProductCard from "@modules/products/components/product-card"
import ProductMedia from "@modules/products/components/product-media"

/**
 * P5 · Editorial (`composer/lib/blocks.js` `key === "p5"`, `blocks.css` `.listing.p5 .ed`).
 * One lead product large — image, title, subtitle, price, Add to bag — then 4 small
 * products in the composer's own default card (`productCard(p, x)`, full meta). The
 * second cart-mutating listing variant in this codebase, alongside hero G
 * (block-port-map.md §6, "high" risk row) — same `AddToBagButton` client island.
 *
 * Lead collection, 5 products (first becomes the lead). Returns a single `<li>`.
 */
export default async function ListingP5({ products: source }: HomeListingProps = {}) {
  const [t, tStore, locale, region] = await Promise.all([
    getTranslations("HomeListing"),
    getTranslations("Store"),
    getLocale(),
    getHomeRegion(),
  ])

  if (!region) {
    return null
  }

  // tenant panel wave 2, piece 8: `source` is `content.products` of the tenant's home-page
  // document. Absent or "popular" keeps this variant's own behaviour.
  const block = await resolveHomeListing({ source, region, limit: 5, scope: "lead" })
  if (!block) {
    return null
  }
  const { heading, href } = block
  const [lead, ...rest] = block.products
  if (!lead) {
    return null
  }

  const { cheapestPrice } = getProductPrice({ product: lead, locale })

  return (
    <li className={HOME_SECTION_CLASS} data-testid="home-listing-p5">
      <ListingSectionHeader
        heading={heading ?? t("p4.heading")}
        href={href ?? "/store"}
        linkLabel={href ? t("seeAll") : tStore("allProducts")}
      />
      <div className="grid grid-cols-2 gap-x-3 gap-y-8 small:grid-cols-4 small:gap-x-6 small:gap-y-10">
        <div className="col-span-2 flex flex-col small:col-span-2 small:row-span-2" data-testid="home-listing-p5-lead">
          {/* The lead photo goes through the same frame as every product picture: whole,
              never cropped to fill the two-row slot. */}
          <Link
            href={`/products/${lead.handle}`}
            className="block rounded-[var(--radius,8px)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ui-fg-interactive"
          >
            <ProductMedia
              src={lead.thumbnail || lead.images?.[0]?.url || null}
              alt={lead.title ?? ""}
              context="gallery"
              priority
            />
          </Link>
          <div className="mt-4 flex flex-col gap-1.5">
            <h3 className="text-xl font-semibold leading-[1.15] text-ui-fg-base small:text-2xl">
              {lead.title}
            </h3>
            {lead.subtitle ? (
              <p className="max-w-[50ch] text-sm text-ui-fg-subtle">{lead.subtitle}</p>
            ) : null}
            <div className="mt-1.5 flex items-center gap-4">
              {cheapestPrice ? (
                <span className="tabular-nums text-lg font-semibold text-ui-fg-base">
                  {cheapestPrice.calculated_price}
                </span>
              ) : null}
              <AddToBagButton product={lead} size="small" />
            </div>
          </div>
        </div>
        {rest.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </li>
  )
}
