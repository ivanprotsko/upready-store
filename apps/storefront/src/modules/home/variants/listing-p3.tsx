import type { HttpTypes } from "@medusajs/types"
import { getLocale, getTranslations } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { getProductPrice } from "@lib/util/get-product-price"
import { getOptionValueHex, isColorOption } from "@lib/util/color-option"
import { getHomeRegion, getLeadCollection, listLeadProducts } from "@lib/data/home"
import Thumbnail from "@modules/products/components/thumbnail"
import AddToBagButton from "@modules/home/components/add-to-bag-button"

/** Colour-option-value count and variant count for one product, the same option-value
 *  bookkeeping `ProductPreview` already does for its colour chips
 *  (`product-preview/index.tsx:36-52`), reduced to counts instead of a swatch list. */
function specCounts(product: HttpTypes.StoreProduct) {
  const usedOptionValueIds = new Set(
    product.variants?.flatMap((v) => v.options?.map((o) => o.id).filter(Boolean) ?? []) ?? []
  )
  const colourCount =
    product.options
      ?.filter((o) => isColorOption(o))
      .flatMap(
        (o) =>
          o.values
            ?.filter((v) => usedOptionValueIds.has(v.id) && getOptionValueHex(v) !== undefined)
            .map((v) => v.id) ?? []
      ).length ?? 0
  return { colourCount, variantCount: product.variants?.length ?? 0 }
}

/**
 * P3 · List (`composer/lib/blocks.js` `key === "p3"`, `blocks.css` `.listing.p3 .rowp`). One
 * row per product: image, title, subtitle, a spec line of colourway/variant counts, price,
 * Add to bag — the composer's own row markup carries the button (`blocks.js:100`), so it
 * ships here too, the shared `AddToBagButton` client island, no new fetch.
 *
 * Lead collection, 6 products. Returns a single `<li>`.
 */
export default async function ListingP3() {
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

  const products = await listLeadProducts({ collectionId: collection.id, region, limit: 6 })
  if (!products.length) {
    return null
  }

  return (
    <li className="content-container py-12 small:py-24" data-testid="home-listing-p3">
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
      <ul className="flex flex-col border-t border-ui-border-base">
        {products.map((product) => {
          const { cheapestPrice } = getProductPrice({ product, locale })
          const { colourCount, variantCount } = specCounts(product)
          return (
            <li
              key={product.id}
              className="grid grid-cols-[96px_1fr] items-center gap-4 border-b border-ui-border-base py-4 small:grid-cols-[150px_1fr_auto] small:gap-6 small:py-5"
            >
              <Link href={`/products/${product.handle}`} className="block w-[96px] small:w-[150px]">
                <Thumbnail
                  thumbnail={product.thumbnail}
                  images={product.images}
                  alt={product.title ?? ""}
                  size="full"
                />
              </Link>
              <div className="min-w-0">
                <Link href={`/products/${product.handle}`}>
                  <h3 className="text-base font-semibold leading-snug text-ui-fg-base small:text-[17px]">
                    {product.title}
                  </h3>
                </Link>
                {product.subtitle ? (
                  <p className="mt-1 text-[13px] leading-relaxed text-ui-fg-subtle">
                    {product.subtitle}
                  </p>
                ) : null}
                {colourCount || variantCount > 1 ? (
                  <div className="mt-2 hidden gap-3.5 text-xs text-ui-fg-subtle small:flex">
                    {colourCount ? <span>{t("spec.colours", { count: colourCount })}</span> : null}
                    {variantCount > 1 ? (
                      <span>{t("spec.variants", { count: variantCount })}</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="col-span-2 flex items-center justify-between gap-3 small:col-span-1 small:flex-col small:items-end small:gap-2.5">
                {cheapestPrice ? (
                  <span className="tabular-nums text-base font-semibold text-ui-fg-base">
                    {cheapestPrice.calculated_price}
                  </span>
                ) : null}
                <AddToBagButton product={product} variant="secondary" size="small" />
              </div>
            </li>
          )
        })}
      </ul>
    </li>
  )
}
