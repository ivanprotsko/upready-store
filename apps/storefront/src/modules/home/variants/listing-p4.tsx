import Image from "next/image"
import { getLocale, getTranslations } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { getProductPrice } from "@lib/util/get-product-price"
import { getHomeRegion, listCatalogProducts } from "@lib/data/home"

/** Desktop/mobile frame height per row position, the same 3-step rotation as
 *  `composer/lib/blocks.css:82,86` (`tall`/`short`/`mid`, cycling `i % 3`). */
const ROW_HEIGHTS = [
  "h-[250px] small:h-[440px]",
  "h-[170px] small:h-[300px]",
  "h-[210px] small:h-[360px]",
] as const

/** `columns-N` below 1024px, N = min(product count, 2) — `blocks.css:85` mobile columns.
 *  A Tailwind utility class, not `column-count` on an inline style: an inline style has
 *  higher specificity than any `small:` class and would have kept forcing the desktop
 *  count on a 390px viewport. */
const MOBILE_COLS: Record<number, string> = { 1: "columns-1", 2: "columns-2" }
/** `small:columns-N`, N = min(product count, 3) — `blocks.css:79`, the "no empty column"
 *  rule P1/P2 also apply. */
const DESKTOP_COLS: Record<number, string> = {
  1: "small:columns-1",
  2: "small:columns-2",
  3: "small:columns-3",
}

/**
 * P4 · Wall (`composer/lib/blocks.js` `key === "p4"`, `blocks.css` `.wall`). A 3-column
 * CSS-columns masonry, 9 products across the whole catalog (`group: "flat"`), image and a
 * one-line caption (title + price) only — the layout technique composer's own note calls
 * new to this storefront, so it is done with `column-count` + `break-inside: avoid` rather
 * than a grid, exactly as `blocks.css:79-80` does it.
 *
 * Column count collapses to the product count when the catalog is short (never fewer
 * than 1, never more than 3), the same "no empty column" rule P1/P2 apply.
 */
export default async function ListingP4() {
  const [t, locale, region] = await Promise.all([
    getTranslations("HomeListing"),
    getLocale(),
    getHomeRegion(),
  ])

  if (!region) {
    return null
  }

  const { products } = await listCatalogProducts({ region, limit: 9 })
  if (!products.length) {
    return null
  }

  const cols =
    `${MOBILE_COLS[Math.min(products.length, 2)] ?? MOBILE_COLS[2]} ` +
    `${DESKTOP_COLS[Math.min(products.length, 3)] ?? DESKTOP_COLS[3]}`

  return (
    <li className="content-container py-12 small:py-24" data-testid="home-listing-p4">
      <h2 className="mb-6 text-lg font-semibold tracking-[-0.02em] text-ui-fg-base small:mb-8 small:text-xl">
        {t("p4.heading")}
      </h2>
      <div
        className={cols}
        style={{ columnGap: "16px" }}
        data-testid="home-listing-p4-wall"
      >
        {products.map((product, i) => {
          const { cheapestPrice } = getProductPrice({ product, locale })
          return (
            <Link
              key={product.id}
              href={`/products/${product.handle}`}
              className="mb-4 block break-inside-avoid"
            >
              <div
                className={`relative w-full overflow-hidden rounded-[var(--radius,8px)] bg-ui-bg-subtle ${ROW_HEIGHTS[i % 3]}`}
              >
                {product.thumbnail ? (
                  <Image
                    src={product.thumbnail}
                    alt=""
                    fill
                    quality={65}
                    sizes="(max-width: 1024px) 50vw, 33vw"
                    className="object-cover object-center"
                  />
                ) : null}
              </div>
              {/* Stacked, not a `justify-between` row (canon: nothing truncated with an
                  ellipsis at 390px) — a long title wraps onto its own lines instead of
                  fighting the price for one line, unlike the composer mock's
                  `.cap2` row (`blocks.css:83-84`). */}
              <div className="mt-2 flex flex-col gap-0.5 text-[13px]">
                <span className="font-medium leading-snug text-ui-fg-base">{product.title}</span>
                {cheapestPrice ? (
                  <span className="tabular-nums font-semibold text-ui-fg-base">
                    {cheapestPrice.calculated_price}
                  </span>
                ) : null}
              </div>
            </Link>
          )
        })}
      </div>
    </li>
  )
}
