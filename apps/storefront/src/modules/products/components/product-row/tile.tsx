import { Link } from "@i18n/navigation"
import ProductMedia from "@modules/products/components/product-media"

/**
 * What one tile of a product row shows. Resolved on the server — the price already a
 * string in the visitor's locale and the region's currency — so the client-side «recently
 * viewed» row can carry the same shape over a server action without price objects.
 */
export type ProductRowItem = {
  id: string
  handle: string
  title: string
  thumbnail: string | null
  /** null when the region has no price for the product; the slot stays, empty. */
  price: string | null
  /** The pre-sale price, only while the product is on sale. */
  originalPrice: string | null
  onSale: boolean
}

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ui-fg-interactive"

// BRANCH-LOCAL (`redesign-olavka`, Ivan's remark 17): the Olavka shops' price and name at
// 1rem, as their catalog card. By the `data-shop` mark the root layout puts on `<html>`,
// because the «recently viewed» row renders this tile on the client.
const OLAVKA_TEXT = "[[data-shop=olavka]_&]:text-base"

/**
 * A tile of the product page's rows, after Ivan's Figma mockup: the photo on the page's
 * own colour with no frame and no veil (`ProductMedia flat`, still the shared 3:4 frame
 * and `contain`, so nothing is cropped), then the price in small bold type, then the
 * name in grey — the mockup's «$ 22 / АСД 2 Армавир раствор 100 мл». The catalog's card
 * keeps its own order (name, unit, price); this tile is the row's. It carries the card's
 * test ids (`product-wrapper`, `product-title`, `price`), so the framing probe of PR 105
 * measures a row the way it measures a grid: level heights, titles and prices on one line.
 */
export default function ProductRowTile({
  item,
  sizes,
  priority,
}: {
  item: ProductRowItem
  /** What the browser should fetch for this slot, from the row's column count. */
  sizes: string
  priority?: boolean
}) {
  return (
    <Link
      href={`/products/${item.handle}`}
      className={`group flex h-full flex-col rounded-[var(--radius,8px)] ${FOCUS_RING}`}
      data-testid="product-wrapper"
    >
      <ProductMedia
        src={item.thumbnail}
        alt={item.title}
        flat
        priority={priority}
        sizes={sizes}
      />
      <div className="mt-3 flex flex-col gap-y-1">
        {/* The price slot keeps its line when the region has no price, so a row of tiles
            stays level. */}
        <span
          className={`flex h-5 items-baseline gap-x-2 text-sm font-semibold leading-5 tabular-nums text-ui-fg-base ${OLAVKA_TEXT} [[data-shop=olavka]_&]:h-6`}
          data-testid="price"
        >
          {item.price}
          {item.onSale && item.originalPrice ? (
            <span
              className="text-xs font-normal text-ui-fg-muted line-through decoration-1"
              data-testid="original-price"
            >
              {item.originalPrice}
            </span>
          ) : null}
        </span>
        <span
          className={`line-clamp-2 text-sm leading-5 text-ui-fg-subtle group-hover:underline group-hover:underline-offset-2 ${OLAVKA_TEXT}`}
          data-testid="product-title"
        >
          {item.title}
        </span>
      </div>
    </Link>
  )
}
