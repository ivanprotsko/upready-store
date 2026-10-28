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

/**
 * The tile of the product page's rows is the catalog card's tile (t-2026-10-20-61 D6): the
 * same photo frame (the profile's aspect, cropped to cover), then the name on one line cut
 * with «…», then the price in the foreground colour, the old price struck in muted grey on
 * a sale. It stays a separate component only because the «recently viewed» row is built on
 * the client from plain `ProductRowItem`s, while `ProductCard` is a server component. It
 * carries the card's test ids (`product-wrapper`, `product-title`, `price`), so the framing
 * probe measures a row the way it measures a grid: level heights, titles and prices on one
 * line.
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
        priority={priority}
        sizes={sizes}
      />
      <div className="mt-3 flex flex-1 flex-col">
        <span
          className="truncate text-sm font-medium leading-5 text-ui-fg-base group-hover:underline group-hover:underline-offset-2"
          title={item.title}
          data-testid="product-title"
        >
          {item.title}
        </span>
        {/* The price line keeps its slot when the region has no price, so a row stays level. */}
        <span
          className="mt-auto flex min-h-7 flex-wrap items-baseline gap-x-2 pt-2 text-base font-semibold tabular-nums text-ui-fg-base"
          data-testid="price"
        >
          {item.price}
          {item.onSale && item.originalPrice ? (
            <span
              className="text-[13px] font-normal text-ui-fg-muted line-through decoration-1"
              data-testid="original-price"
            >
              {item.originalPrice}
            </span>
          ) : null}
        </span>
      </div>
    </Link>
  )
}
