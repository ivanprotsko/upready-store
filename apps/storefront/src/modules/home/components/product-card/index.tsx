import type { HttpTypes } from "@medusajs/types"
import { getLocale } from "next-intl/server"

import { Link } from "@i18n/navigation"
import { getProductPrice } from "@lib/util/get-product-price"
import { productImageDark } from "@lib/util/mode-image"
import Thumbnail from "@modules/products/components/thumbnail"

/**
 * The card the P1/P2/P5 listing variants share, ported from `productCard()`
 * (`composer/lib/blocks.js:43-48`) — the one card shape composer's whole listing family
 * draws from, switched only by its `meta` argument. `ProductPreview`
 * (`modules/products/components/product-preview/index.tsx`) is NOT reused here: it never
 * shows `subtitle` (block-port-map.md §6's own gap note), which `meta="full"` needs.
 *
 * `meta`:
 *  - "full" — title, subtitle, price (P1, P5's four small cards)
 *  - "min"  — title and price on one line (P2, `card-p.min` in blocks.css:60-61)
 *
 * Pure server component, no cart mutation — P1/P2/P5's small cards are all links to the
 * product page, same as `ProductPreview`. The one exception (P5's lead card, which does
 * carry Add to bag) is NOT this component; it is built inline in `listing-p5.tsx`.
 */
export default async function ProductCard({
  product,
  region: _region,
  meta = "full",
  priority,
}: {
  product: HttpTypes.StoreProduct
  // Matches `ProductPreview`'s own prop contract (`product-preview/index.tsx`): pricing
  // is already resolved onto `product.variants[].calculated_price` by the caller's own
  // `listProducts({ regionId })` call, so this card does not re-derive it from `region` —
  // the prop stays for call-site symmetry with the other product cards on this page.
  region: HttpTypes.StoreRegion
  meta?: "full" | "min"
  priority?: boolean
}) {
  const locale = await getLocale()
  const { cheapestPrice } = getProductPrice({ product, locale })

  return (
    <Link
      href={`/products/${product.handle}`}
      className="group block min-w-0"
      data-testid="home-product-card"
    >
      <Thumbnail
        thumbnail={product.thumbnail}
        thumbnailDark={productImageDark(product)}
        images={product.images}
        alt={product.title ?? ""}
        priority={priority}
        size="full"
        data-testid="home-product-card-thumbnail"
      />
      {meta === "min" ? (
        // No `truncate` here on purpose (canon: nothing truncated with an ellipsis at
        // 390px) — the title wraps in its own row instead of sharing one line with the
        // price, which is what forced the ellipsis in the composer's static mock
        // (`blocks.css:60-61`, a single flex row with no overflow handling).
        <div className="mt-2 flex flex-col gap-0.5">
          <span className="text-[13px] font-medium leading-snug text-ui-fg-base">
            {product.title}
          </span>
          {cheapestPrice ? (
            <span className="tabular-nums text-[13px] font-medium text-ui-fg-base">
              {cheapestPrice.calculated_price}
            </span>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-1">
          <span className="text-sm font-medium leading-snug text-ui-fg-base">
            {product.title}
          </span>
          {product.subtitle ? (
            <span className="text-xs leading-relaxed text-ui-fg-subtle">
              {product.subtitle}
            </span>
          ) : null}
          {cheapestPrice ? (
            <span className="mt-1 tabular-nums text-sm font-semibold text-ui-fg-base">
              {cheapestPrice.calculated_price}
            </span>
          ) : null}
        </div>
      )}
    </Link>
  )
}
