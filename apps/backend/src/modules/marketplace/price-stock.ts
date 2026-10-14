/**
 * PRICES AND STOCKS OF ONE MARKETPLACE NEXT TO THE SHOP'S
 * («Wildberries → Цены и остатки», mp-section-design task-03; the freshness
 * and aggregation rules below are w17-mp-price-stock-table's).
 *
 * READ-ONLY. The shop's numbers stand next to the marketplace's, the gaps are
 * pointed at, and NOTHING here writes anywhere. Ivan's standing invariant of
 * 2026-09-16 02:46 WITA — no inline edit, no bulk action, no «отправить на
 * площадку» — is proved by `__tests__/price-stock-read-only.unit.spec.ts` and
 * not by this sentence.
 *
 * THE ROW IS THE CARD. One row per `mp_product` of the marketplace, and one
 * row per shop variant that no card of this marketplace is linked to. The tie
 * between the two is `mp_link`, the same table «Товары» reads and writes
 * (w14): the projector writes it by the article after every import and the
 * owner writes it by hand, so a card linked on «Товары» is «Есть везде» here
 * on the next request, and the two screens cannot disagree about it. The w17
 * screen matched by the article on its own instead, and a hand-made link never
 * reached it.
 *
 * THE NUMBER ON THE ROW IS THE SUM OF THE LINES IN ITS DRAWER, by
 * construction: `aggregateLines` is the only place a card's price and stock
 * are decided, and both the row and the drawer's lines come from the same
 * `mp_offer` rows. `__tests__/price-stock.unit.spec.ts` asserts the identity.
 *
 * FRESHNESS IS PART OF THE NUMBER. A number whose age is hidden is a number
 * that lies, so every card carries the age of what it shows and is called
 * «Устарело» past the kind's interval times three. The age is taken from the
 * OLDER of two facts, never the newer one:
 *
 *   - `mp_offer.measured_at` — when the marketplace measured the line. It is
 *     honest for the stock, and OPTIMISTIC for the price of the same line: the
 *     WB and Ozon normalisers write the STOCK fetch time onto a row that
 *     carries both numbers (`modules/wb/normalize.ts`, `modules/ozon/normalize.ts`),
 *     because the price came from a different request whose own time the row
 *     does not keep;
 *   - the last SUCCEEDED `mp_sync_run` of that family for that marketplace —
 *     when we last imported prices, or stocks, at all.
 *
 * A number cannot be fresher than the import that brought it, so the age is
 * measured from the older of the two and the screen never claims a price is
 * current because a stock was fetched an hour later.
 *
 * PURE. The rows come from the caller, the decisions come from here, `now` is
 * an argument and not a `Date.now()` inside (a staleness that reads the clock
 * where it is used cannot be tested).
 *
 * Each section lives in its own file in `price-stock/`, and this file
 * re-exports them (t-2026-10-14-55): the freshness and the aggregation in
 * `freshness.ts`, the rows in `rows.ts`, the query string in `query.ts`, the
 * filter, the order and the counts in `filter-sort.ts`, the file in `csv.ts`.
 */

export {
  STALE_FACTOR,
  staleAfterMs,
  DEFAULT_PRICE_STOCK_THRESHOLDS,
  lastImportOf,
  freshnessOf,
  aggregateLines,
} from "./price-stock/freshness";
export type {
  PriceStockFamily,
  PriceStockLine,
  PriceStockImport,
  PriceStockThresholds,
  Freshness,
} from "./price-stock/freshness";
export {
  PRICE_STOCK_STATES,
  highlightOf,
  buildPriceStockRows,
  offersWithoutCard,
} from "./price-stock/rows";
export type {
  PriceStockState,
  PriceStockCard,
  PriceStockLink,
  PriceStockVariant,
  PriceStockRow,
  BuildPriceStockInput,
} from "./price-stock/rows";
export {
  PRICE_STOCK_ORDER_FIELDS,
  DEFAULT_PRICE_STOCK_LIMIT,
  PRICE_STOCK_EXPORT_LIMIT,
  parsePriceStockQuery,
} from "./price-stock/query";
export type { PriceStockOrderField, PriceStockQuery } from "./price-stock/query";
export {
  filterPriceStockRows,
  sortPriceStockRows,
  priceStockCounts,
  measuredOf,
} from "./price-stock/filter-sort";
export type { PriceStockCounts } from "./price-stock/filter-sort";
export { priceStockCsvColumns, priceStockCsvCells, toPriceStockCsv } from "./price-stock/csv";
