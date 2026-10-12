import { clx } from "@medusajs/ui"
import Image from "next/image"
import { getLocale } from "next-intl/server"

import { Link } from "@i18n/navigation"

import BlockIcon from "../../shared/block-icon"
import BlockSection from "../../shared/block-section"
import { pickText } from "../../shared/localized-text"
import type { SectionHeader } from "../../shared/section-header"
import OrderCell from "./order-cell"
import { PRICE_LIST_HEADING, type PriceTableLabels, type PriceTableProps } from "./props"
import { toRows, type PriceTableRow, type StockState } from "./rows"
import { readSelection } from "./selection"
import { focusRing, QUIET, SKU } from "./styles"

/**
 * A cell from 600 px, where the rows are a table again. Below it the row is a grid and the
 * cell a grid item with no padding of its own (a `td` keeps the browser's 1 px otherwise).
 */
const PAD = "p-0 min-[600px]:px-2 min-[600px]:py-[var(--layer-space-2,0.5rem)] min-[600px]:align-middle"
const CELL = clx("min-[600px]:table-cell", PAD)

/** A column of SKU, stock or unit: its own from 1024 px, folded under the title below it. */
const META_CELL = clx("hidden small:table-cell", PAD)

const HEAD = "px-2 py-3 text-start text-xs font-medium text-[var(--muted-foreground)] whitespace-nowrap"

/** The stock words' colour: a shipping product reads as the text, the others step back. */
const STOCK_TONE: Record<StockState, string> = {
  in: "text-[var(--foreground)]",
  backorder: "text-[var(--muted-foreground)]",
  out: "text-[var(--muted-foreground)]",
}

const STOCK_LABEL: Record<StockState, keyof PriceTableLabels> = {
  in: "inStock",
  backorder: "backorder",
  out: "outOfStock",
}

/** The 40 px picture: the product's thumbnail, or the catalogue's package on `--muted`. */
function Thumbnail({ src }: { src: string | null }) {
  return (
    <div aria-hidden className="relative size-10 shrink-0 overflow-hidden rounded-[var(--radius)] bg-[var(--muted)]">
      {src ? (
        <Image src={src} alt="" fill sizes="40px" className="object-cover" />
      ) : (
        <span className="flex size-full items-center justify-center text-[var(--muted-foreground)]">
          <BlockIcon name="package" className="size-4" />
        </span>
      )}
    </div>
  )
}

/**
 * `listing/price-table` (t-2026-10-12-33 wave 2): a wholesale price list, the 16.09 lab's
 * `price-list` and the heart of its B2B template (opt). A wholesale buyer orders from a table,
 * not from cards: each row is a product of the `source` (a category, a collection or a sort,
 * the shape of `collection/featured`), at most `limit`, read through `readSelection`.
 *
 * - A row: a 40 px thumbnail, the title linking to the product, the SKU, the stock state and
 *   the region's price (`columns` picks which of SKU, stock and unit show), then a quantity
 *   stepper, at least 1, and «В корзину» through the client cart queue (`OrderCell`). A product
 *   with several variants links to its page instead, its price the cheapest, «от …».
 * - No tier column: the store API answers one calculated price per variant for a quantity of
 *   one, `min_quantity` and `max_quantity` empty (measured on globex, acme, initech and
 *   cherkashino, 13.10.2026), so there is no ladder to show, and none is invented.
 * - Under 600 px a row is a card of two lines: the picture, the title with the SKU and stock
 *   under it, the price; then the stepper and the button across. From 600 px it is a table
 *   that fits its container, never scrolling: the order cell puts the button under the stepper
 *   when the column is narrow, and SKU, stock and unit get their own columns from 1024 px and
 *   stay under the title below that. The table keeps its roles in every layout (`role="row"`,
 *   `"cell"`), so a screen reader still reads a table when a row is drawn as a grid.
 * - `note`, the minimum order or the terms, stands under the table.
 *
 * With no product in the source (or no such category or collection, or a failed read) it
 * draws nothing.
 */
export default async function PriceTable({ header, source, limit, columns, unit, note, labels }: PriceTableProps) {
  const locale = await getLocale()
  const selection = await readSelection(source, limit).catch(() => null)
  const rows: PriceTableRow[] = selection ? toRows(selection.products, locale) : []

  if (!selection || !rows.length) {
    return null
  }

  const word = (key: keyof PriceTableLabels) => pickText(labels[key], locale) ?? ""
  const unitWord = columns.includes("unit") ? pickText(unit, locale) : null
  const noteText = pickText(note, locale)
  const show = { sku: columns.includes("sku"), stock: columns.includes("stock"), unit: Boolean(unitWord) }
  const orderLabels = {
    quantity: word("quantity"),
    decrease: word("decrease"),
    increase: word("increase"),
    addToCart: word("addToCart"),
    added: word("added"),
  }

  // The shell's header: the template's words, or the category's or collection's name, or
  // «Прайс-лист» for a sort.
  const shownHeader: SectionHeader = {
    eyebrow: header?.eyebrow ?? {},
    heading: pickText(header?.heading, locale)
      ? header!.heading
      : selection.title
        ? { [locale]: selection.title }
        : PRICE_LIST_HEADING,
    description: header?.description ?? {},
    seeAll: header?.seeAll ?? null,
  }

  return (
    <BlockSection block="listing/price-table" locale={locale} header={shownHeader}>
      <table
        role="table"
        data-role="table"
        className="block w-full border-collapse text-base text-[var(--foreground)] min-[600px]:table small:text-sm"
      >
        <thead role="rowgroup" className="hidden min-[600px]:table-header-group">
          <tr role="row" className="bg-[var(--muted)]">
            <th role="columnheader" scope="col" colSpan={2} className={HEAD}>
              {word("product")}
            </th>
            {show.sku ? (
              <th role="columnheader" scope="col" className={clx(HEAD, "hidden small:table-cell")}>
                {word("sku")}
              </th>
            ) : null}
            {show.stock ? (
              <th role="columnheader" scope="col" className={clx(HEAD, "hidden small:table-cell")}>
                {word("stock")}
              </th>
            ) : null}
            {show.unit ? (
              <th role="columnheader" scope="col" className={clx(HEAD, "hidden small:table-cell")}>
                {word("unit")}
              </th>
            ) : null}
            <th role="columnheader" scope="col" className={clx(HEAD, "text-end")}>
              {word("price")}
            </th>
            <th role="columnheader" scope="col" className={HEAD}>
              {word("quantity")}
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup" className="block min-[600px]:table-row-group">
          {rows.map((row) => {
            const stockWord = word(STOCK_LABEL[row.stock])
            // What folds under the title below 1024 px: the SKU and the stock.
            const meta = [show.sku ? row.sku : null, show.stock ? stockWord : null].filter(Boolean)
            return (
              <tr
                key={row.id}
                role="row"
                data-role="table-row"
                className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 border-b border-[var(--border)] py-[var(--layer-space-3,0.75rem)] min-[600px]:table-row"
              >
                <td role="cell" className={clx(CELL, "col-start-1 row-start-1 min-[600px]:w-10 min-[600px]:pe-0")}>
                  <Thumbnail src={row.thumbnail} />
                </td>
                <td role="cell" className={clx(CELL, "col-start-2 row-start-1 min-w-0 [overflow-wrap:anywhere]")}>
                  <Link
                    href={`/products/${row.handle}`}
                    className={clx(
                      "flex min-h-11 flex-col justify-center rounded-[var(--radius)] hover:underline hover:underline-offset-4 small:min-h-9",
                      focusRing
                    )}
                  >
                    <span className="line-clamp-2 text-base text-[var(--foreground)] small:text-sm">{row.title}</span>
                    {meta.length ? (
                      <span className="mt-1 flex flex-wrap gap-x-2 text-xs text-[var(--muted-foreground)] small:hidden">
                        {meta.map((item, index) => (
                          <span key={index} className={index === 0 && show.sku && row.sku ? SKU : undefined}>
                            {item}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </Link>
                </td>
                {show.sku ? (
                  <td role="cell" className={clx(META_CELL, SKU, "text-xs text-[var(--muted-foreground)] [overflow-wrap:anywhere]")}>
                    {row.sku ?? <span aria-hidden>—</span>}
                  </td>
                ) : null}
                {show.stock ? (
                  <td role="cell" className={clx(META_CELL, "whitespace-nowrap")}>
                    <span data-role="stock-badge" className={STOCK_TONE[row.stock]}>
                      {stockWord}
                    </span>
                  </td>
                ) : null}
                {show.unit ? (
                  <td role="cell" className={clx(META_CELL, "whitespace-nowrap text-[var(--muted-foreground)]")}>
                    {unitWord}
                  </td>
                ) : null}
                <td role="cell" className={clx(CELL, "col-start-3 row-start-1 whitespace-nowrap text-end")}>
                  {row.price ? (
                    <span className="inline-flex flex-col items-end">
                      <span className="inline-flex items-baseline gap-1">
                        {row.fromPrice ? (
                          <span className="text-xs text-[var(--muted-foreground)]">{word("from")}</span>
                        ) : null}
                        <span data-role="price" data-testid="price" className="text-base font-semibold tabular-nums small:text-sm">
                          {row.price}
                        </span>
                      </span>
                      {row.originalPrice ? (
                        <span
                          data-testid="original-price"
                          className="text-xs tabular-nums text-[var(--muted-foreground)] line-through"
                        >
                          {row.originalPrice}
                        </span>
                      ) : null}
                      {unitWord ? (
                        <span className="text-xs text-[var(--muted-foreground)] small:hidden">/ {unitWord}</span>
                      ) : null}
                    </span>
                  ) : null}
                </td>
                <td role="cell" className={clx(CELL, "col-span-3 row-start-2")}>
                  {row.order.kind === "add" ? (
                    <OrderCell line={row.order.line} productTitle={row.title} labels={orderLabels} />
                  ) : row.order.kind === "choose" ? (
                    <Link
                      href={`/products/${row.handle}`}
                      className={clx(
                        QUIET,
                        "text-[var(--foreground)] transition-opacity hover:opacity-80 motion-reduce:transition-none",
                        focusRing
                      )}
                    >
                      {word("choose")}
                    </Link>
                  ) : (
                    <button type="button" disabled className={clx(QUIET, "cursor-not-allowed text-[var(--muted-foreground)]")}>
                      {word("outOfStock")}
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {noteText ? (
        <p data-role="description" className="mt-4 max-w-prose text-base text-[var(--muted-foreground)] small:text-sm">
          {noteText}
        </p>
      ) : null}
    </BlockSection>
  )
}
