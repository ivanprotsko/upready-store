import { clx } from "@medusajs/ui"

import ProductRowTile, { type ProductRowItem } from "./tile"

/** The mockup draws two rows: four tiles («С этим товаром покупают») and six («Вы недавно просматривали»). */
export type ProductRowColumns = 4 | 6

/**
 * The list of a row. From 1024 a grid of exactly `columns` tiles in one line; below that
 * the same tiles in a strip that scrolls sideways and bleeds to the screen's edge (the
 * container's own 16px padding, undone and re-added inside), so a phone shows the row's
 * shape — two and a bit tiles, the rest by a swipe — instead of a grid that wraps. The
 * scroll padding matches that inner padding: with mandatory snapping and none, the browser
 * snaps the first tile to the very edge and the left padding is scrolled away on load
 * (measured at 390: the first tile stood at x=0 instead of 16).
 */
export const productRowListClass = (columns: ProductRowColumns) =>
  clx(
    "-mx-4 flex snap-x snap-mandatory gap-x-3 overflow-x-auto px-4 pb-1 scroll-px-4 no-scrollbar",
    "small:mx-0 small:grid small:snap-none small:gap-x-6 small:overflow-visible small:px-0 small:pb-0",
    columns === 4 ? "small:grid-cols-4" : "small:grid-cols-6"
  )

export const productRowItemClass = (columns: ProductRowColumns) =>
  clx(
    "shrink-0 snap-start small:w-auto small:min-w-0",
    columns === 4 ? "w-[42vw] xsmall:w-[28vw]" : "w-[38vw] xsmall:w-[22vw]"
  )

/** What the browser fetches for a tile: about half a phone screen, a quarter or a sixth of a desktop one. */
export const productRowSizes = (columns: ProductRowColumns) =>
  columns === 4
    ? "(max-width: 1023px) 42vw, 25vw"
    : "(max-width: 1023px) 38vw, 17vw"

/**
 * A row of products under the product page's cards, after Ivan's Figma mockup (frame
 * «ProductPage», `handoff/o-20260921-01/t-2026-09-22-01-pdp-figma-layout.md`): a left-aligned
 * heading in regular weight, then the tiles in one line. Plain and synchronous on
 * purpose — the server-rendered «bought with this» row and the client-rendered «recently
 * viewed» row are the same component fed the same `ProductRowItem`s.
 */
export default function ProductRow({
  heading,
  items,
  columns,
  "data-testid": dataTestid,
}: {
  heading: string
  items: ProductRowItem[]
  columns: ProductRowColumns
  "data-testid"?: string
}) {
  const sizes = productRowSizes(columns)

  return (
    <section className="flex flex-col" data-testid={dataTestid}>
      <h2 className="mb-6 text-start text-2xl font-normal leading-8 tracking-[-0.01em] text-ui-fg-base small:mb-8 small:text-[28px] small:leading-9">
        {heading}
      </h2>
      <ul className={productRowListClass(columns)} data-testid="product-row">
        {items.map((item) => (
          <li key={item.id} className={productRowItemClass(columns)}>
            <ProductRowTile item={item} sizes={sizes} />
          </li>
        ))}
      </ul>
    </section>
  )
}
