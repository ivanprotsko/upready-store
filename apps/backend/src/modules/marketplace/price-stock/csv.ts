import type { PriceStockRow, PriceStockState } from "./rows";

/**
 * The export: the file of exactly the rows the table shows.
 *
 * `../price-stock.ts` re-exports what callers use from here (t-2026-10-14-55).
 */


/**
 * The columns of the file, IN THE ORDER OF THE TABLE: product, the shop's
 * price, the marketplace's price with its gap, the shop's stock, the
 * marketplace's stock with its gap, where, updated. What the table shows in a
 * tooltip or not at all (the marketplace's id of the card, the reserve, the
 * line count) follows at the end, so a reader comparing the file with the
 * screen reads the same columns left to right.
 */
export const priceStockCsvColumns = (label: string): string[] => [
  "Продукт",
  "Артикул",
  "Цена в магазине",
  `Цена на ${label}`,
  `Цена на ${label} без скидки`,
  "Расхождение цены",
  "Расхождение цены, %",
  "Валюта",
  "Остаток в магазине, шт",
  `Остаток на ${label}, шт`,
  "Расхождение остатка, шт",
  "Где есть",
  "Обновлено",
  "Устарело",
  "Выше порога",
  `Карточка на ${label}`,
  `В резерве на ${label}, шт`,
  "Строк по складам и размерам",
];

const STATE_LABEL: Record<PriceStockState, (label: string) => string> = {
  both: () => "Есть везде",
  shop_only: () => "Только в магазине",
  marketplace_only: (label) => `Только на ${label}`,
};

const SEPARATOR = ";";

/**
 * RFC 4180 quoting over `;`. A TEXT whose first character is `=`, `+`, `-` or
 * `@` is prefixed with a single quote, because Excel and LibreOffice treat such
 * a cell as a formula, and a marketplace's title is text somebody else typed.
 * A NUMBER is not: «-117» is a price gap, and quoting it would turn it into
 * text nobody can add up.
 */
const csvCell = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number") {
    /** The Russian Excel reads `1290.5` as text and `1290,5` as a number. */
    return String(value).replace(".", ",");
  }
  let text = value;
  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The values of one row, in `priceStockCsvColumns` order. */
export const priceStockCsvCells = (row: PriceStockRow, label: string): (string | number | null)[] => {
  const mp = row.mp;
  return [
    row.title,
    row.vendor_code,
    row.shop?.price ?? null,
    mp ? (mp.discount_price ?? mp.price) : null,
    mp && mp.discount_price !== null ? mp.price : null,
    row.diff.price_abs,
    row.diff.price_pct,
    row.currency,
    row.shop?.stock ?? null,
    mp?.stock ?? null,
    row.diff.stock_abs,
    STATE_LABEL[row.state](label),
    mp ? (mp.stock_measured_at ?? mp.price_measured_at) : null,
    mp ? (mp.price_stale || mp.stock_stale ? "да" : "нет") : null,
    row.diff.highlighted ? "да" : "нет",
    row.external_id,
    mp?.reserved ?? null,
    mp?.lines ?? null,
  ];
};

/**
 * The export of EXACTLY the rows handed in, header first: `;`, `\r\n` and a
 * UTF-8 BOM, the shape `order-feed.ts` writes, because the owner opens it in a
 * Russian Excel. Lines of the file = rows + 1.
 */
export const toPriceStockCsv = (rows: readonly PriceStockRow[], label: string): string => {
  const lines = [priceStockCsvColumns(label).map(csvCell).join(SEPARATOR)];
  for (const row of rows) {
    lines.push(priceStockCsvCells(row, label).map(csvCell).join(SEPARATOR));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
};
