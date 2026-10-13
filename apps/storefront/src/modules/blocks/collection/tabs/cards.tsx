import type { HttpTypes } from "@medusajs/types"
import { clx } from "@medusajs/ui"

import ProductCard from "@modules/products/components/product-card"

import FeaturedCarousel from "../featured/carousel"

/**
 * A card's width in `collection/featured`'s carousel, the classes of its `index.tsx`: two cards
 * and the edge of a third on a phone, three and an edge from 720 px, exactly `columns` from
 * 1024 px on the grid's 1.5rem gap.
 */
const CARD_WIDTH = "w-[42%] shrink-0 snap-start min-[720px]:w-[30%]"
const CAROUSEL_WIDTH: Record<number, string> = {
  3: "small:w-[calc((100%-3rem)/3)]",
  4: "small:w-[calc((100%-4.5rem)/4)]",
  5: "small:w-[calc((100%-6rem)/5)]",
}

/** `ProductCard` reads `--product-media-ratio` (3 / 4 by default); the block hands it the photo layer. */
const PHOTO_LAYER = "[--product-media-ratio:var(--layer-photo-aspect,3/4)]"

/**
 * One tab's products in `collection/featured`'s carousel, on the storefront's own `ProductCard`.
 * The server draws the first tab with it, and the action of `load.tsx` the others.
 */
export default function TabCards({
  products,
  columns,
  previousLabel,
  nextLabel,
}: {
  products: HttpTypes.StoreProduct[]
  columns: number
  previousLabel: string
  nextLabel: string
}) {
  return (
    <FeaturedCarousel
      overflows={products.length > columns}
      previousLabel={previousLabel}
      nextLabel={nextLabel}
      className={PHOTO_LAYER}
    >
      {products.map((product) => (
        <li key={product.id} data-role="product-card" className={clx("min-w-0", CARD_WIDTH, CAROUSEL_WIDTH[columns])}>
          <ProductCard product={product} />
        </li>
      ))}
    </FeaturedCarousel>
  )
}
