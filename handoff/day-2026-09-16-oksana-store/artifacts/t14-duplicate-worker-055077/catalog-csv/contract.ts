/**
 * The columns of the catalogue spreadsheet. This file IS the contract between
 * `GET /tenants/catalog/export` and `POST /tenants/catalog/imports`: the export
 * writes exactly these headers, and the import accepts exactly these headers,
 * so a file that went out unedited comes back understood.
 *
 * Two column families are dynamic and cannot live in a fixed list:
 *
 * - `price_<currency>` — one per currency the shop prices in, lowercase ISO
 *   code (`price_rub`, `price_usd`). Which ones exist depends on the shop's
 *   regions, so the export computes them and the import reads whatever it
 *   finds, rejecting a currency the store has no region for.
 * - `metadata_<key>` — one per product metadata key the shop uses. The migrated
 *   shop keeps its source ids there (`metadata_source_id` and friends), and
 *   dropping them on a round trip would quietly destroy the trail back to
 *   olavka.ru.
 */

/** Fixed columns, in the order the export writes them (prices and metadata are spliced in). */
export const FIXED_COLUMNS = [
  "handle",
  "title",
  "subtitle",
  "description",
  "status",
  "category",
  "variant_title",
  "sku",
  "stock",
  "weight",
  "length",
  "width",
  "height",
  "images",
  "thumbnail",
] as const;

export type FixedColumn = (typeof FIXED_COLUMNS)[number];

export const PRICE_PREFIX = "price_";
export const METADATA_PREFIX = "metadata_";

/** Separator inside the `images` cell. `|` is not legal in a URL, so it can never split one. */
export const IMAGE_SEPARATOR = "|";

/**
 * Headers a hand-made file may use instead of the canonical id, lowercased.
 * Deliberately short: this is for the owner who types a price list from
 * scratch, not a guessing engine. Everything resolved through this map is
 * named in the dry-run report, so the owner sees how the file was understood
 * rather than trusting it.
 *
 * A bare `price` / `цена` has no currency in its name; the import binds it to
 * the shop's own default currency and says so in the report.
 */
export const HEADER_ALIASES: Record<string, string> = {
  // handle
  "handle": "handle",
  "ссылка": "handle",
  "url": "handle",
  "слаг": "handle",
  // title
  "название": "title",
  "наименование": "title",
  "товар": "title",
  "name": "title",
  // subtitle
  "подзаголовок": "subtitle",
  // description
  "описание": "description",
  // status
  "статус": "status",
  // category
  "категория": "category",
  "категории": "category",
  // variant
  "вариант": "variant_title",
  "вариация": "variant_title",
  // sku
  "артикул": "sku",
  "sku": "sku",
  // stock
  "остаток": "stock",
  "количество": "stock",
  "наличие": "stock",
  // weight
  "вес": "weight",
  "вес, г": "weight",
  // dimensions
  "длина": "length",
  "ширина": "width",
  "высота": "height",
  // images
  "картинки": "images",
  "изображения": "images",
  "фото": "images",
  // thumbnail
  "обложка": "thumbnail",
  "картинка карточки": "thumbnail",
  // price without a currency in the name
  "price": PRICE_PREFIX,
  "цена": PRICE_PREFIX,
};

export type ColumnMapping = {
  /** The header as it stands in the file. */
  header: string;
  /** The canonical column id, or `null` when the column is not understood (ignored). */
  column: string | null;
  /** Set when the header was resolved through an alias, for the report. */
  via_alias?: boolean;
};

const normalizeHeader = (header: string): string =>
  header.replace(/^﻿/, "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Resolves the file's header line to canonical column ids.
 *
 * `defaultCurrency` is what a bare `price` column binds to. `knownCurrencies`
 * is only used to spell the bound column (`price_rub`); an unknown currency in
 * an explicit `price_xxx` header is NOT rejected here — the planner does that,
 * because it needs the line number and the whole-file verdict.
 */
export const mapHeader = (
  header: string[],
  defaultCurrency: string | null,
): ColumnMapping[] =>
  header.map((raw) => {
    const normalized = normalizeHeader(raw);

    if (normalized === "") {
      return { header: raw, column: null };
    }

    if ((FIXED_COLUMNS as readonly string[]).includes(normalized)) {
      return { header: raw, column: normalized };
    }

    if (normalized.startsWith(PRICE_PREFIX) && normalized.length > PRICE_PREFIX.length) {
      return { header: raw, column: normalized };
    }

    if (normalized.startsWith(METADATA_PREFIX) && normalized.length > METADATA_PREFIX.length) {
      return { header: raw, column: normalized };
    }

    const alias = HEADER_ALIASES[normalized];

    if (alias === PRICE_PREFIX) {
      return defaultCurrency
        ? { header: raw, column: `${PRICE_PREFIX}${defaultCurrency}`, via_alias: true }
        : { header: raw, column: null };
    }

    if (alias) {
      return { header: raw, column: alias, via_alias: true };
    }

    return { header: raw, column: null };
  });

/** The currency codes named by `price_<currency>` columns, lowercase, in file order. */
export const currenciesOf = (mapping: ColumnMapping[]): string[] => {
  const seen: string[] = [];

  for (const entry of mapping) {
    if (entry.column?.startsWith(PRICE_PREFIX)) {
      const code = entry.column.slice(PRICE_PREFIX.length);
      if (!seen.includes(code)) {
        seen.push(code);
      }
    }
  }

  return seen;
};

/** The metadata keys named by `metadata_<key>` columns, in file order. */
export const metadataKeysOf = (mapping: ColumnMapping[]): string[] => {
  const seen: string[] = [];

  for (const entry of mapping) {
    if (entry.column?.startsWith(METADATA_PREFIX)) {
      const key = entry.column.slice(METADATA_PREFIX.length);
      if (!seen.includes(key)) {
        seen.push(key);
      }
    }
  }

  return seen;
};

/** The export's header line: fixed columns with prices and metadata spliced in at their places. */
export const exportHeader = (currencies: string[], metadataKeys: string[]): string[] => {
  const header: string[] = [];

  for (const column of FIXED_COLUMNS) {
    if (column === "stock") {
      for (const currency of currencies) {
        header.push(`${PRICE_PREFIX}${currency}`);
      }
    }
    header.push(column);
  }

  for (const key of metadataKeys) {
    header.push(`${METADATA_PREFIX}${key}`);
  }

  return header;
};
