import Image from "next/image"
import { getLocale, getTranslations } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { getProductPrice } from "@lib/util/get-product-price"
import { getHomeRegion, getLeadCollection, listLeadProducts } from "@lib/data/home"
import ProductCard from "@modules/home/components/product-card"
import AddToBagButton from "@modules/home/components/add-to-bag-button"

/**
 * P5 · Editorial (`composer/lib/blocks.js` `key === "p5"`, `blocks.css` `.listing.p5 .ed`).
 * One lead product large — image, title, subtitle, price, Add to bag — then 4 small
 * products in the composer's own default card (`productCard(p, x)`, full meta). The
 * second cart-mutating listing variant in this codebase, alongside hero G
 * (block-port-map.md §6, "high" risk row) — same `AddToBagButton` client island.
 *
 * Lead collection, 5 products (first becomes the lead). Returns a single `<li>`.
 */
export default async function ListingP5() {
  const [t, locale, region] = await Promise.all([
    getTranslations("HomeListing"),
    getLocale(),
    getHomeRegion(),
  ])

  if (!region) {
    return null
  }

  const collection = await getLeadCollection()
  if (!collection) {
    return null
  }

  const [lead, ...rest] = await listLeadProducts({
    collectionId: collection.id,
    region,
    limit: 5,
  })
  if (!lead) {
    return null
  }

  const { cheapestPrice } = getProductPrice({ product: lead, locale })

  return (
    <li className="content-container py-12 small:py-24" data-testid="home-listing-p5">
      <div className="mb-6 flex items-baseline justify-between gap-4 small:mb-8">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-ui-fg-base small:text-xl">
          {collection.title}
        </h2>
        <Link
          href={`/collections/${collection.handle}`}
          className="flex shrink-0 items-center gap-1 text-sm font-medium text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
        >
          {t("seeAll")}
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4 small:grid-cols-4 small:gap-[18px]">
        <div className="col-span-2 flex flex-col small:col-span-2 small:row-span-2">
          <Link
            href={`/products/${lead.handle}`}
            className="relative aspect-[4/5] w-full overflow-hidden rounded-[var(--radius,8px)] bg-ui-bg-subtle small:aspect-auto small:min-h-[520px] small:flex-1"
          >
            {lead.thumbnail ? (
              <Image
                src={lead.thumbnail}
                alt=""
                fill
                priority
                quality={70}
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover object-center"
              />
            ) : null}
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
          <ProductCard key={product.id} product={product} region={region} meta="full" />
        ))}
      </div>
    </li>
  )
}
