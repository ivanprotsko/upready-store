import type { HttpTypes } from "@medusajs/types"
import { getLocale, getTranslations } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { getOptionValueHex, isColorOption } from "@lib/util/color-option"
import { getProductPrice } from "@lib/util/get-product-price"
import { isOlavkaShop } from "@lib/data/olavka-shop"
import { isPlaceholderOption } from "@lib/util/option-filter-groups"
import ProductMedia from "@modules/products/components/product-media"

/**
 * The product card. Every grid of products uses it: the catalog, a category, a
 * collection, the home listings and the related products of a product page.
 *
 * Cards in one row are equal in height by construction, not by luck. The frame has a
 * fixed ratio, the title reserves two lines whether it needs them or not, the unit line
 * keeps its slot when it is empty, and the price row is pushed to the bottom of a card
 * that stretches to the height of its grid row. So across a row the titles start on one
 * line and the prices stand on one line.
 *
 * The grid itself is `PRODUCT_GRID_CLASS`: two columns on a phone, three from 1024 and
 * four from 1440, on one gap scale.
 *
 * BRANCH-LOCAL (`redesign-olavka`, Ivan's remark of 2026-09-27, «3 колонки в 1 ряд с
 * товарами должно появляться только при ширине <=960»): on the Olavka shops two columns
 * below 720, three from 720 to 960 and four above 960, by the `data-shop` mark the root
 * layout puts on `<html>`. The gaps keep their scale (12 below 1024, 24 from it). The row
 * budgets follow the same columns.
 *
 * BRANCH-LOCAL (`redesign-olavka`, Ivan's remark 17): the Olavka shops
 * (`OLAVKA_SHOP_HANDLES`) show only the price and, under it, the title, both at 1rem. There
 * is no unit line (no «100 мл», «1 шт» or swatches) and the title reserves no second line,
 * so a row's cards may differ in height.
 */
export const PRODUCT_GRID_CLASS =
  "grid w-full grid-cols-2 gap-x-3 gap-y-8 small:grid-cols-3 small:gap-x-6 small:gap-y-10 large:grid-cols-4 " +
  "[[data-shop=olavka]_&]:min-[720px]:grid-cols-3 [[data-shop=olavka]_&]:min-[961px]:grid-cols-4"

/**
 * A row budget for a grid that is a teaser, not a listing (a home section, the related
 * products): it never ends on a ragged row. `long` is for twelve cards: four rows of
 * three, three of four, and the first eight (four rows of two) on a phone. `short` is for
 * eight: two rows of four, four of two, and six at three columns.
 */
export const PRODUCT_GRID_ROW_BUDGET = {
  long:
    "[&>li:nth-child(n+9)]:hidden small:[&>li:nth-child(n+9)]:block " +
    "[[data-shop=olavka]_&]:min-[720px]:[&>li:nth-child(n+9)]:block",
  short:
    "small:[&>li:nth-child(n+7)]:hidden large:[&>li:nth-child(n+7)]:block " +
    "[[data-shop=olavka]_&]:min-[720px]:[&>li:nth-child(n+7)]:hidden [[data-shop=olavka]_&]:min-[961px]:[&>li:nth-child(n+7)]:block",
} as const

const MAX_SWATCHES = 5

export default async function ProductCard({
  product,
  priority,
}: {
  product: HttpTypes.StoreProduct
  priority?: boolean
}) {
  const [locale, t, olavka] = await Promise.all([
    getLocale(),
    getTranslations("ProductCard"),
    isOlavkaShop(),
  ])
  const { cheapestPrice } = getProductPrice({ product, locale })

  const usedOptionValueIds = new Set(
    product.variants?.flatMap((v) => v.options?.map((o) => o.id).filter(Boolean) ?? []) ?? []
  )

  // Medusa's "Default option" of a product created without options is bookkeeping, not a
  // choice, and never reaches the card (measured on acme/globex/initech, 2026-09-12).
  const unitLine = (product.options ?? [])
    .filter((o) => !isColorOption(o) && !isPlaceholderOption(o))
    .flatMap((o) => o.values?.filter((v) => usedOptionValueIds.has(v.id)).map((v) => v.value) ?? [])
    .join(" · ")

  const swatches = (product.options ?? [])
    .filter((o) => isColorOption(o))
    .flatMap((o) => o.values?.filter((v) => usedOptionValueIds.has(v.id)) ?? [])
    .filter((v) => getOptionValueHex(v) !== undefined)

  const onSale = cheapestPrice?.price_type === "sale"
  const images = product.images ?? []
  const first = product.thumbnail || images[0]?.url || null
  const second = images.find((image) => image.url && image.url !== first)?.url ?? null

  const media = (
    <div className="relative">
      <ProductMedia src={first} secondSrc={second} alt={product.title ?? ""} priority={priority} />
      {onSale && cheapestPrice?.percentage_diff ? (
        <span
          className="absolute start-2 top-2 rounded-full bg-ui-tag-red-bg px-2 py-0.5 text-xs font-medium tabular-nums text-ui-tag-red-text"
          data-testid="product-sale-badge"
        >
          <span aria-hidden>−{cheapestPrice.percentage_diff}%</span>
          <span className="sr-only">{t("sale", { percent: cheapestPrice.percentage_diff })}</span>
        </span>
      ) : null}
    </div>
  )
  const linkClassName =
    "group flex h-full flex-col rounded-[var(--radius,8px)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ui-fg-interactive"

  if (olavka) {
    return (
      <Link href={`/products/${product.handle}`} className={linkClassName} data-testid="product-wrapper">
        {media}
        <div className="mt-3 flex flex-col gap-y-1">
          {cheapestPrice ? (
            <div className="flex flex-wrap items-baseline gap-x-2 text-base tabular-nums">
              <span
                className={onSale ? "font-semibold text-ui-fg-error" : "font-semibold text-ui-fg-base"}
                data-testid="price"
              >
                {cheapestPrice.calculated_price}
              </span>
              {onSale ? (
                <span className="text-ui-fg-muted line-through decoration-1" data-testid="original-price">
                  {cheapestPrice.original_price}
                </span>
              ) : null}
            </div>
          ) : null}
          <h3
            className="line-clamp-2 break-words text-base font-medium text-ui-fg-base group-hover:underline group-hover:underline-offset-2"
            data-testid="product-title"
          >
            {product.title}
          </h3>
        </div>
      </Link>
    )
  }

  return (
    <Link href={`/products/${product.handle}`} className={linkClassName} data-testid="product-wrapper">
      {media}

      <div className="mt-3 flex flex-1 flex-col">
        <h3
          className="line-clamp-2 min-h-10 break-words text-sm font-medium leading-5 text-ui-fg-base group-hover:underline group-hover:underline-offset-2"
          data-testid="product-title"
        >
          {product.title}
        </h3>

        {/* The unit slot keeps its line when the product has nothing to say in it. */}
        <div className="mt-1 flex h-5 items-center justify-between gap-x-2 text-[13px] leading-5 text-ui-fg-subtle">
          <span className="min-w-0 truncate" title={unitLine || undefined} data-testid="product-unit">
            {unitLine}
          </span>
          {swatches.length > 0 ? (
            <span className="flex shrink-0 items-center gap-x-1">
              {swatches.slice(0, MAX_SWATCHES).map((color) => (
                <span
                  key={color.id}
                  title={color.value}
                  className="inline-block size-3 rounded-full border border-ui-border-base"
                  style={{ backgroundColor: getOptionValueHex(color) }}
                />
              ))}
            </span>
          ) : null}
        </div>

        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-2 tabular-nums">
          {cheapestPrice ? (
            <>
              <span
                className={onSale ? "text-base font-semibold text-ui-fg-error" : "text-base font-semibold text-ui-fg-base"}
                data-testid="price"
              >
                {cheapestPrice.calculated_price}
              </span>
              {onSale ? (
                <span className="text-[13px] text-ui-fg-muted line-through decoration-1" data-testid="original-price">
                  {cheapestPrice.original_price}
                </span>
              ) : null}
            </>
          ) : (
            // A product with no price in this region still holds the price line.
            <span className="text-base" aria-hidden>
              &nbsp;
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
