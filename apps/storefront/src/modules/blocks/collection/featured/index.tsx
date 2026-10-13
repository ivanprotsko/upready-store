import { clx } from "@medusajs/ui"
import { getLocale } from "next-intl/server"

import ProductCard from "@modules/products/components/product-card"

import BlockSection from "../../shared/block-section"
import { pickText } from "../../shared/localized-text"
import { SEE_ALL_LABEL, type SectionHeader } from "../../shared/section-header"
import FeaturedCarousel from "./carousel"
import { NEWEST_HEADING, type FeaturedCollectionProps } from "./props"
import { readSelection, type Selection } from "./selection"

/** The cards in a row from 1024 px, by `columns`; two on a phone and three from 720 px. */
const GRID_COLUMNS: Record<number, string> = {
  3: "small:grid-cols-3",
  4: "small:grid-cols-4",
  5: "small:grid-cols-5",
}

/** A carousel card from 1024 px: exactly `columns` of them across, on the grid's 1.5rem gap. */
const CAROUSEL_WIDTH: Record<number, string> = {
  3: "small:w-[calc((100%-3rem)/3)]",
  4: "small:w-[calc((100%-4.5rem)/4)]",
  5: "small:w-[calc((100%-6rem)/5)]",
}

/**
 * The card's frame follows the template's photo layer. `ProductCard` reads
 * `--product-media-ratio` (3 / 4 by default), so the block hands it `--layer-photo-aspect` on
 * its own list, and a page with no template keeps 3 / 4.
 */
const PHOTO_LAYER = "[--product-media-ratio:var(--layer-photo-aspect,3/4)]"

/**
 * How many cards a grid of `columns` shows of `count`: whole rows only, so the section never
 * ends on a ragged row, unless there are fewer cards than one row.
 */
const wholeRows = (count: number, columns: number) => (count >= columns ? count - (count % columns) : count)

/** The grid's classes for card `index`: hidden at a width where it would start a ragged row. */
function rowBudget(index: number, count: number, columns: number) {
  const phone = index >= wholeRows(count, 2)
  const tablet = index >= wholeRows(count, 3)
  const desktop = index >= wholeRows(count, columns)
  return clx(
    phone && "hidden",
    tablet !== phone && (tablet ? "min-[720px]:hidden" : "min-[720px]:block"),
    desktop !== tablet && (desktop ? "small:hidden" : "small:block")
  )
}

/**
 * `collection/featured` (t-2026-10-12-33, R1 build list item 4): a selection of the shop's
 * products that a template places as many times as it likes, where the `listing` slot is one
 * per page (two selections on home at Impulse, Refresh, Studio, Taste and Trade). The source
 * is a category, a collection or the newest of the catalogue; `limit` products, 4 to 12, read
 * through `readSelection` (published only, priced for the visitor's region).
 *
 * - The header is the shell's: the template's words, or the category's or collection's name
 *   (`NEWEST_HEADING` for the newest), and «see all» to the source unless the template gives
 *   its own link.
 * - The card is the storefront's own `ProductCard`, the one of the listing slot and the
 *   catalogue: picture, title, price, the sale badge. Its frame takes `--layer-photo-aspect`.
 * - `grid`: two cards a row on a phone, three from 720 px, `columns` from 1024 px, whole rows
 *   only. `carousel`: one row with scroll snapping, two cards and the edge of a third on a
 *   phone, three and an edge from 720 px, exactly `columns` from 1024 px, with arrows there.
 *
 * With no product in the source (or no such category or collection, or a failed read) it
 * draws nothing.
 */
export default async function FeaturedCollection({
  header,
  source,
  limit,
  layout,
  columns,
  previousLabel,
  nextLabel,
}: FeaturedCollectionProps) {
  const locale = await getLocale()

  let selection: Selection | null
  try {
    selection = await readSelection(source, limit)
  } catch (error) {
    // A failed read is not an empty source (rule 20a): name it, and leave the section out.
    console.error(`collection/featured: could not read ${JSON.stringify(source)}`, error)
    return null
  }
  if (!selection) return null

  const { products } = selection
  // The source's own name in the shop's language, when the template wrote no heading.
  const sourceHeading = selection.title ? { [locale]: selection.title } : "sort" in source ? NEWEST_HEADING : {}
  const shellHeader: SectionHeader = {
    eyebrow: header?.eyebrow ?? {},
    heading: header && pickText(header.heading, locale) ? header.heading : sourceHeading,
    description: header?.description ?? {},
    seeAll: header?.seeAll ?? { href: selection.href, label: SEE_ALL_LABEL },
  }

  const cards = products.map((product, index) => (
    <li
      key={product.id}
      data-role="product-card"
      className={clx(
        "min-w-0",
        layout === "carousel"
          ? clx("w-[42%] shrink-0 snap-start min-[720px]:w-[30%]", CAROUSEL_WIDTH[columns])
          : rowBudget(index, products.length, columns)
      )}
    >
      <ProductCard product={product} />
    </li>
  ))

  return (
    <BlockSection block="collection/featured" locale={locale} header={shellHeader}>
      {layout === "carousel" ? (
        <FeaturedCarousel
          overflows={products.length > columns}
          previousLabel={pickText(previousLabel, locale) ?? ""}
          nextLabel={pickText(nextLabel, locale) ?? ""}
          className={PHOTO_LAYER}
        >
          {cards}
        </FeaturedCarousel>
      ) : (
        <ul
          className={clx(
            "grid grid-cols-2 gap-x-3 gap-y-8 min-[720px]:grid-cols-3 small:gap-x-6 small:gap-y-10",
            GRID_COLUMNS[columns],
            PHOTO_LAYER
          )}
        >
          {cards}
        </ul>
      )}
    </BlockSection>
  )
}
