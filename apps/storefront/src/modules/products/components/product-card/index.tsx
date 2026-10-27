import type { HttpTypes } from "@medusajs/types"
import { getLocale, getTranslations } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { getWishlistProductIds, isWishlistCustomerLoggedIn } from "@lib/data/wishlist"
import { getOptionValueHex, isColorOption } from "@lib/util/color-option"
import { getProductPrice } from "@lib/util/get-product-price"
import { isPlaceholderOption } from "@lib/util/option-filter-groups"
import ProductMedia from "@modules/products/components/product-media"
import WishlistButton from "@modules/products/components/wishlist-button"

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
 * The Olavka shops (`OLAVKA_SHOP_HANDLES`, by the `data-shop` mark the root layout puts on
 * `<html>`) turn three columns much earlier (Ivan, 27.09.2026: «3 колонки в 1 ряд с
 * товарами должно появляться только при ширине <=960»): two columns below 720, three from
 * 720 to 960, four above 960. The gaps keep their scale, 12 below 1024 and 24 from it. The
 * row budgets, the collapsed grid and the Olavka footer follow the same widths
 * (`product-grid-class.test.ts` holds them together).
 */
export const PRODUCT_GRID_CLASS =
  "grid w-full grid-cols-2 gap-x-3 gap-y-8 small:grid-cols-3 small:gap-x-6 small:gap-y-10 large:grid-cols-4 [[data-shop=olavka]_&]:min-[720px]:grid-cols-3 [[data-shop=olavka]_&]:min-[961px]:grid-cols-4"

/**
 * The catalog's page beside its side column (`/store`, a category, a collection), from 1024,
 * where the side column appears. Every shop but the Olavka ones keeps a side column of 248
 * and a gap of 32.
 *
 * On the Olavka shops the page is four equal columns on the product grid's own gap (Ivan,
 * 06.10.2026: «максимальное число колонок страницы = 4, поэтому на этой странице при
 * наличии сайдабара можно отображать три колонки в ряд, чтобы данные футера выравнивались
 * правильно»). The side column takes the first one and the cards the other three, so a
 * card column starts where a footer column starts: the Olavka footer stands on the same
 * four tracks with its first one empty (`footer/variants/olavka.tsx`).
 */
export const CATALOG_COLUMNS_CLASS =
  "grid grid-cols-1 gap-8 lg:grid-cols-[248px_1fr] [[data-shop=olavka]_&]:min-[1024px]:grid-cols-4 [[data-shop=olavka]_&]:min-[1024px]:gap-x-6"

/** The cell of `CATALOG_COLUMNS_CLASS` that holds the cards: columns 2 to 4 on the Olavka shops. */
export const CATALOG_MAIN_COLUMN_CLASS = "w-full [[data-shop=olavka]_&]:min-[1024px]:col-span-3"

/**
 * The product grid inside `CATALOG_MAIN_COLUMN_CLASS`. On the Olavka shops it is three
 * columns from 1024 at every width, one per page column, and never turns four: four
 * tracks beside the side column are not the page's tracks. Every other shop has one set of
 * columns for both grids.
 */
export const PRODUCT_GRID_BESIDE_SIDEBAR_CLASS = `${PRODUCT_GRID_CLASS} [[data-shop=olavka]_&]:min-[1024px]:grid-cols-3`

/**
 * A row budget for a grid that is a teaser, not a listing (a home section, the related
 * products): it never ends on a ragged row. `long` is for twelve cards: four rows of
 * three, three of four, and the first eight (four rows of two) on a phone. `short` is for
 * eight: two rows of four, four of two, and six at three columns. On the Olavka shops the
 * same counts at that grid's widths: all twelve from 720, six from 720 to 960.
 */
export const PRODUCT_GRID_ROW_BUDGET = {
  long: "[&>li:nth-child(n+9)]:hidden small:[&>li:nth-child(n+9)]:block [[data-shop=olavka]_&]:min-[720px]:[&>li:nth-child(n+9)]:block",
  short:
    "small:[&>li:nth-child(n+7)]:hidden large:[&>li:nth-child(n+7)]:block [[data-shop=olavka]_&]:min-[720px]:[&>li:nth-child(n+7)]:hidden [[data-shop=olavka]_&]:min-[961px]:[&>li:nth-child(n+7)]:block",
} as const

/**
 * Below this many products a teaser grid collapses: one card in a grid of four read as
 * a missing catalog, in light and dark alike. Collapsed, the cards keep the width they
 * have in three columns, whatever the viewport offers beyond that, and the row is
 * centred, so one, two or three cards form a whole row rather than the start of one.
 * Three cards fill it exactly from 1024 up (from 720 on the Olavka shops). On a phone
 * the columns stay two and a third card is centred under them.
 */
export const PRODUCT_GRID_COLLAPSE_BELOW = 4

export const PRODUCT_GRID_COLLAPSED_CLASS =
  "flex w-full flex-wrap justify-center gap-x-3 gap-y-8 small:gap-x-6 small:gap-y-10"

/** The width of one cell of the collapsed grid, from the gaps of `PRODUCT_GRID_CLASS`. */
export const PRODUCT_GRID_COLLAPSED_ITEM_CLASS =
  "w-[calc((100%-0.75rem)/2)] small:w-[calc((100%-3rem)/3)] [[data-shop=olavka]_&]:min-[720px]:w-[calc((100%-1.5rem)/3)] [[data-shop=olavka]_&]:min-[1024px]:w-[calc((100%-3rem)/3)]"

const MAX_SWATCHES = 5

export default async function ProductCard({
  product,
  priority,
  layout = "card",
}: {
  product: HttpTypes.StoreProduct
  priority?: boolean
  /**
   * `row` is the catalog's list view: the picture on the left, the text beside it, and the
   * start of the description, which a card has no room for.
   */
  layout?: "card" | "row"
}) {
  const row = layout === "row"
  const [locale, t, wishlistLoggedIn, wishlistProductIds] = await Promise.all([
    getLocale(),
    getTranslations("ProductCard"),
    isWishlistCustomerLoggedIn(),
    getWishlistProductIds(),
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

  return (
    <Link
      href={`/products/${product.handle}`}
      className={
        row
          ? "group flex h-full flex-row items-start gap-x-4 rounded-[var(--radius,8px)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ui-fg-interactive"
          : "group flex h-full flex-col rounded-[var(--radius,8px)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ui-fg-interactive"
      }
      data-testid="product-wrapper"
    >
      <div className={row ? "relative w-28 shrink-0 small:w-40" : "relative"}>
        <ProductMedia src={first} secondSrc={second} alt={product.title ?? ""} priority={priority} />
        <WishlistButton
          productId={product.id}
          initialActive={wishlistProductIds.includes(product.id)}
          isLoggedIn={wishlistLoggedIn}
          className="absolute end-2 top-2 z-10 inline-flex items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--ui-bg-base)_80%,transparent)] p-1.5 text-ui-fg-subtle shadow-elevation-card-rest transition-colors hover:text-ui-fg-base disabled:opacity-60"
        />
        {onSale && cheapestPrice?.percentage_diff ? (
          <span
            // theme-colours allowlist: the sale badge, a decorative tag colour and not an error status.
            className="absolute start-2 top-2 rounded-full bg-ui-tag-red-bg px-2 py-0.5 text-xs font-medium tabular-nums text-ui-tag-red-text"
            data-testid="product-sale-badge"
          >
            <span aria-hidden>−{cheapestPrice.percentage_diff}%</span>
            <span className="sr-only">{t("sale", { percent: cheapestPrice.percentage_diff })}</span>
          </span>
        ) : null}
      </div>

      <div className={row ? "flex min-w-0 flex-1 flex-col self-stretch" : "mt-3 flex flex-1 flex-col"}>
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

        {row && product.description ? (
          <p className="mt-2 line-clamp-2 break-words text-sm leading-5 text-ui-fg-subtle" data-testid="product-excerpt">
            {product.description}
          </p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-2 tabular-nums">
          {cheapestPrice ? (
            <>
              <span
                className={
                  onSale
                    ? "text-base font-semibold text-ui-fg-error"
                    : "text-base font-semibold text-ui-fg-base"
                }
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
