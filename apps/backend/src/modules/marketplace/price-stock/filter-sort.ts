import {
  type PriceStockImport,
  type PriceStockLine,
  aggregateLines,
  earlier,
  lastImportOf,
} from "./freshness";
import type { PriceStockOrderField, PriceStockQuery } from "./query";
import type { PriceStockRow, PriceStockState } from "./rows";

/**
 * Filter, order, page: what the query does to the rows, and the counts and
 * dates the screen prints over them.
 *
 * `../price-stock.ts` re-exports what callers use from here (t-2026-10-14-55).
 */


const collator = new Intl.Collator("ru", { numeric: true, sensitivity: "base" });

/** `q` looks in the two fields the screen shows on the row: the title and the article. */
export const filterPriceStockRows = (
  rows: readonly PriceStockRow[],
  query: Pick<PriceStockQuery, "q" | "states" | "over_threshold">,
): PriceStockRow[] => {
  const needle = query.q?.toLocaleLowerCase("ru") ?? null;
  return rows.filter(
    (row) =>
      (!query.states || query.states.includes(row.state)) &&
      (!query.over_threshold || row.diff.highlighted) &&
      (!needle ||
        (row.title ?? "").toLocaleLowerCase("ru").includes(needle) ||
        (row.vendor_code ?? "").toLocaleLowerCase("ru").includes(needle)),
  );
};

const STATE_ORDER: Record<PriceStockState, number> = { both: 0, marketplace_only: 1, shop_only: 2 };

const sortValue = (row: PriceStockRow, field: PriceStockOrderField): string | number | null => {
  switch (field) {
    case "title":
      return row.title;
    case "vendor_code":
      return row.vendor_code;
    /** «По расхождению» is by its SIZE: −30 % is as far off as +30 %. */
    case "price_pct":
      return row.diff.price_pct === null ? null : Math.abs(row.diff.price_pct);
    case "stock_abs":
      return row.diff.stock_abs === null ? null : Math.abs(row.diff.stock_abs);
  }
};

/** By title, a row without one LAST: a nameless card on top of the first page reads as a broken table. */
const byTitle = (left: PriceStockRow, right: PriceStockRow): number =>
  Number(!left.title) - Number(!right.title) ||
  collator.compare(left.title ?? "", right.title ?? "") ||
  collator.compare(left.id, right.id);

/**
 * The order of the table. A row with nothing to sort by (no gap, no title) is
 * LAST in both directions: a row without a price gap is not «the smallest
 * gap», and putting it first on ascending would bury the real ones.
 *
 * Without `order`: the highlighted rows first, then «Есть везде», «Только на
 * площадке», «Только в магазине», each by title — the rows that need a look
 * before the rows that cannot have a gap at all.
 */
export const sortPriceStockRows = (
  rows: readonly PriceStockRow[],
  order: PriceStockQuery["order"],
): PriceStockRow[] => {
  if (!order) {
    return [...rows].sort(
      (left, right) =>
        Number(right.diff.highlighted) - Number(left.diff.highlighted) ||
        STATE_ORDER[left.state] - STATE_ORDER[right.state] ||
        byTitle(left, right),
    );
  }
  return [...rows].sort((left, right) => {
    const a = sortValue(left, order.field);
    const b = sortValue(right, order.field);
    if (a === null || a === "" || b === null || b === "") {
      const aEmpty = a === null || a === "";
      const bEmpty = b === null || b === "";
      return aEmpty === bEmpty ? byTitle(left, right) : aEmpty ? 1 : -1;
    }
    const compared = typeof a === "number" && typeof b === "number" ? a - b : collator.compare(String(a), String(b));
    return (order.desc ? -compared : compared) || byTitle(left, right);
  });
};

export type PriceStockCounts = Record<PriceStockState | "over_threshold", number>;

/** Counted over the WHOLE table of the marketplace, before any filter, so a filter does not change its own labels. */
export const priceStockCounts = (rows: readonly PriceStockRow[]): PriceStockCounts => {
  const counts: PriceStockCounts = { both: 0, shop_only: 0, marketplace_only: 0, over_threshold: 0 };
  for (const row of rows) {
    counts[row.state] += 1;
    if (row.diff.highlighted) {
      counts.over_threshold += 1;
    }
  }
  return counts;
};

/**
 * «Цены Wildberries на …, остатки на …» of the subtitle: the NEWEST
 * measurement in the table, never later than the last import of that family
 * that succeeded (a number cannot be fresher than the import that brought it).
 */
export const measuredOf = (
  lines: readonly PriceStockLine[],
  imports: readonly PriceStockImport[],
  marketplace: string,
): { prices_at: string | null; stocks_at: string | null } => {
  const aggregate = aggregateLines(lines);
  const cap = (measured: string | null, imported: string | null) => (measured && imported ? earlier(measured, imported) : measured);
  return {
    prices_at: cap(aggregate.price_newest_at, lastImportOf(imports, marketplace, "prices")),
    stocks_at: cap(aggregate.stock_newest_at, lastImportOf(imports, marketplace, "stocks")),
  };
};
