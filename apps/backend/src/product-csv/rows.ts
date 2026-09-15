/**
 * Records into typed rows, with every complaint carrying the line number the
 * shop owner sees in Excel (t14-product-import).
 *
 * Two rules decided here, both of them about safety rather than convenience:
 *
 * AN EMPTY CELL MEANS "NO CHANGE". Uniformly, for every column. A price list
 * assembled by hand has holes in it, and the alternative reading ("empty means
 * clear this field") turns one careless Ctrl+A into a catalogue of nameless,
 * priceless products. Clearing a field stays the panel's job; the import's job
 * is bulk editing. The one consequence worth stating out loud: a round trip
 * with no edits cannot change anything, which is why the acceptance test for
 * it is meaningful at all.
 *
 * THE ROW KEY IS `handle` + `SKU` + variant title. One row per variant, so the
 * same handle repeats across the rows of a product with several variants; what
 * may never repeat is the key. For a flat price list, where SKU is empty, that
 * reduces to "a handle may appear once", which is the duplicate the acceptance
 * criteria name as fatal.
 */

import {
  FIXED_COLUMNS,
  IMAGE_SEPARATOR,
  isAmbiguousNumber,
  metadataHeader,
  normalizeHeader,
  parseNumber,
  parseStatus,
  priceHeader,
  resolveColumn,
  splitCategoryPath,
  splitImageUrls,
  type FixedColumnId,
  type ResolvedColumn,
} from "./columns";
import type { CsvRecord, ParsedCsv } from "./csv";

/** A complaint about the file as a whole. Any one of them rejects every row. */
export type FatalError = {
  code:
    | "empty_file"
    | "no_key_column"
    | "duplicate_column"
    | "duplicate_row"
    | "unknown_currency"
    | "too_many_rows"
    | "too_large"
    | "not_a_table";
  message: string;
  /** Absent for a complaint about the file rather than one of its lines. */
  line?: number;
};

/** A complaint about one row. The row is rejected; the file is not. */
export type RowError = {
  code:
    | "missing_title"
    | "bad_number"
    | "ambiguous_number"
    | "bad_status"
    | "bad_image_url"
    | "unknown_handle"
    | "ambiguous_variant"
    | "handle_taken"
    | "sku_taken"
    | "no_identity";
  message: string;
  column?: string;
};

export type RowDraft = {
  /** 1-based physical line in the uploaded file; the header is line 1. */
  line: number;
  handle: string | null;
  sku: string | null;
  variant_title: string | null;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  status: "draft" | "published" | "proposed" | "rejected" | null;
  category_path: string[] | null;
  image_urls: string[] | null;
  /** Currency code (lowercase) to amount, only the cells that carried a number. */
  prices: Record<string, number>;
  stock: number | null;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  /** Product metadata keys the file carried a value for. */
  metadata: Record<string, string>;
  errors: RowError[];
};

export type HeaderMap = {
  columns: ResolvedColumn[];
  /** Header text as it stood in the file, per position, for the report. */
  headers: string[];
  /** Headers this feature does not know. Reported, then ignored. */
  unknown: string[];
  /** Currencies the file prices in, lowercase, in file order. */
  currencies: string[];
  /** Metadata keys the file carries. */
  metadata_keys: string[];
  fatal: FatalError[];
};

const KEY_COLUMNS: FixedColumnId[] = ["handle", "sku"];

export const readHeader = (header: CsvRecord): HeaderMap => {
  const columns = header.cells.map(resolveColumn);
  const headers = header.cells.map((cell) => cell.trim());
  const fatal: FatalError[] = [];
  const unknown: string[] = [];
  const currencies: string[] = [];
  const metadataKeys: string[] = [];

  const seenFixed = new Map<FixedColumnId, number>();
  const seenPrice = new Map<string, number>();
  const seenMetadata = new Map<string, number>();

  columns.forEach((column, index) => {
    const raw = headers[index] || `колонка ${index + 1}`;

    if (column.kind === "unknown") {
      if (normalizeHeader(raw) !== "") {
        unknown.push(raw);
      }
      return;
    }

    if (column.kind === "fixed") {
      const first = seenFixed.get(column.id);
      if (first !== undefined) {
        fatal.push({
          code: "duplicate_column",
          message: `Колонка «${raw}» встречается дважды (позиции ${first + 1} и ${index + 1}). Оставьте одну.`,
          line: header.line,
        });
        return;
      }
      seenFixed.set(column.id, index);
      return;
    }

    if (column.kind === "price") {
      const first = seenPrice.get(column.currency_code);
      if (first !== undefined) {
        fatal.push({
          code: "duplicate_column",
          message: `Цена в ${column.currency_code.toUpperCase()} задана дважды (позиции ${first + 1} и ${index + 1}). Оставьте одну.`,
          line: header.line,
        });
        return;
      }
      seenPrice.set(column.currency_code, index);
      currencies.push(column.currency_code);
      return;
    }

    const firstMeta = seenMetadata.get(column.key);
    if (firstMeta !== undefined) {
      fatal.push({
        code: "duplicate_column",
        message: `Метаданные «${column.key}» заданы дважды (позиции ${firstMeta + 1} и ${index + 1}). Оставьте одну.`,
        line: header.line,
      });
      return;
    }
    seenMetadata.set(column.key, index);
    metadataKeys.push(column.key);
  });

  const hasKey = KEY_COLUMNS.some((id) => seenFixed.has(id));

  if (!hasKey) {
    fatal.push({
      code: "no_key_column",
      message:
        "В файле нет ни колонки «Код товара», ни «SKU». Одна из них нужна, чтобы понять, какой товар правится. " +
        "Скачайте выгрузку каталога и правьте её, не меняя строку заголовков.",
      line: header.line,
    });
  }

  return {
    columns,
    headers,
    unknown,
    currencies,
    metadata_keys: metadataKeys,
    fatal,
  };
};

const cellAt = (record: CsvRecord, index: number): string => (record.cells[index] ?? "").trim();

const emptyDraft = (line: number): RowDraft => ({
  line,
  handle: null,
  sku: null,
  variant_title: null,
  title: null,
  subtitle: null,
  description: null,
  status: null,
  category_path: null,
  image_urls: null,
  prices: {},
  stock: null,
  weight: null,
  length: null,
  width: null,
  height: null,
  metadata: {},
  errors: [],
});

const NUMERIC_FIELDS: {
  id: FixedColumnId;
  field: "stock" | "weight" | "length" | "width" | "height";
}[] = [
  { id: "stock", field: "stock" },
  { id: "weight", field: "weight" },
  { id: "length", field: "length" },
  { id: "width", field: "width" },
  { id: "height", field: "height" },
];

/**
 * A URL an image may be downloaded from, as far as the FORMAT goes. Whether it
 * may actually be fetched is `images.ts`'s decision (private addresses, hop
 * limits, size and content type) and is made at fetch time, not here.
 */
const isProbablyHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

export const readRow = (record: CsvRecord, header: HeaderMap): RowDraft => {
  const draft = emptyDraft(record.line);
  const positions = new Map<FixedColumnId, number>();

  header.columns.forEach((column, index) => {
    if (column.kind === "fixed") {
      if (!positions.has(column.id)) {
        positions.set(column.id, index);
      }
      return;
    }

    if (column.kind === "price") {
      const raw = cellAt(record, index);
      if (raw === "") {
        return;
      }
      if (isAmbiguousNumber(raw)) {
        draft.errors.push({
          code: "ambiguous_number",
          column: priceHeader(column.currency_code),
          message: `Цена «${raw}» читается двояко: это ${raw.replace(",", ".")} или ${raw.replace(",", "")}? Напишите без разделителя разрядов — «${raw.replace(",", "")}» — либо с двумя знаками после запятой.`,
        });
        return;
      }

      const amount = parseNumber(raw);
      if (amount === null || amount < 0) {
        draft.errors.push({
          code: "bad_number",
          column: priceHeader(column.currency_code),
          message: `Цена «${raw}» — не число. Уберите буквы и лишние символы; разделитель дробной части — запятая или точка.`,
        });
        return;
      }
      draft.prices[column.currency_code] = amount;
      return;
    }

    if (column.kind === "metadata") {
      const raw = cellAt(record, index);
      if (raw === "") {
        return;
      }
      draft.metadata[column.key] = raw;
    }
  });

  const text = (id: FixedColumnId): string => {
    const index = positions.get(id);
    return index === undefined ? "" : cellAt(record, index);
  };

  draft.handle = text("handle") || null;
  draft.sku = text("sku") || null;
  draft.variant_title = text("variant_title") || null;
  draft.title = text("title") || null;
  draft.subtitle = text("subtitle") || null;
  draft.description = text("description") || null;

  const statusRaw = text("status");
  if (statusRaw !== "") {
    const status = parseStatus(statusRaw);
    if (!status) {
      draft.errors.push({
        code: "bad_status",
        column: "Статус",
        message: `Статус «${statusRaw}» непонятен. Напишите «опубликован» или «черновик».`,
      });
    } else {
      draft.status = status;
    }
  }

  const categoryRaw = text("category");
  if (categoryRaw !== "") {
    const path = splitCategoryPath(categoryRaw);
    draft.category_path = path.length > 0 ? path : null;
  }

  const imagesRaw = text("images");
  if (imagesRaw !== "") {
    const urls = splitImageUrls(imagesRaw);
    const bad = urls.filter((url) => !isProbablyHttpUrl(url));

    if (bad.length > 0) {
      draft.errors.push({
        code: "bad_image_url",
        column: "Картинки",
        message: `Не похоже на ссылку: ${bad.join(", ")}. Нужен полный адрес, начинающийся с http:// или https://; несколько ссылок разделяются знаком «${IMAGE_SEPARATOR.trim()}».`,
      });
    }

    const good = urls.filter((url) => isProbablyHttpUrl(url));
    draft.image_urls = good.length > 0 ? good : null;
  }

  for (const { id, field } of NUMERIC_FIELDS) {
    const raw = text(id);
    if (raw === "") {
      continue;
    }

    const column = FIXED_COLUMNS.find((spec) => spec.id === id)!.header;

    if (isAmbiguousNumber(raw)) {
      draft.errors.push({
        code: "ambiguous_number",
        column,
        message: `«${raw}» в колонке «${column}» читается двояко: ${raw.replace(",", ".")} или ${raw.replace(",", "")}? Напишите без разделителя разрядов.`,
      });
      continue;
    }

    const value = parseNumber(raw);

    if (value === null || value < 0 || !Number.isFinite(value)) {
      draft.errors.push({
        code: "bad_number",
        column,
        message: `«${raw}» в колонке «${column}» — не число.`,
      });
      continue;
    }

    if (field === "stock" && !Number.isInteger(value)) {
      draft.errors.push({
        code: "bad_number",
        column,
        message: `Остаток «${raw}» должен быть целым числом.`,
      });
      continue;
    }

    draft[field] = value;
  }

  if (!draft.handle && !draft.sku) {
    draft.errors.push({
      code: "no_identity",
      message: "В строке нет ни кода товара, ни SKU — непонятно, к какому товару она относится.",
    });
  }

  return draft;
};

/** The row key duplicates are counted on: the whole key, not the handle alone. */
export const rowKey = (draft: RowDraft): string =>
  [draft.handle ?? "", draft.sku ?? "", draft.variant_title ?? ""]
    .map((part) => normalizeHeader(part))
    .join(" ");

export type ReadFileResult = {
  header: HeaderMap;
  rows: RowDraft[];
  fatal: FatalError[];
};

export const readRows = (parsed: ParsedCsv): ReadFileResult => {
  const header = readHeader(parsed.header);
  const fatal = [...header.fatal];
  const rows = parsed.records.map((record) => readRow(record, header));

  const seen = new Map<string, number>();

  for (const row of rows) {
    const key = rowKey(row);
    const first = seen.get(key);

    if (first !== undefined) {
      const name = row.handle ? `«${row.handle}»` : `SKU «${row.sku}»`;
      fatal.push({
        code: "duplicate_row",
        line: row.line,
        message: `Строка ${row.line} повторяет товар ${name} из строки ${first}. Оставьте одну строку на товар (или задайте варианты с разными SKU).`,
      });
      continue;
    }

    seen.set(key, row.line);
  }

  return { header, rows, fatal };
};

/** Header order of an export, so the round trip reads its own file back. */
export const exportHeaderRow = (currencies: string[], metadataKeys: string[]): string[] => [
  ...FIXED_COLUMNS.filter((column) => column.id !== "images").map((column) => column.header),
  ...currencies.map((currency) => priceHeader(currency)),
  ...metadataKeys.map((key) => metadataHeader(key)),
  FIXED_COLUMNS.find((column) => column.id === "images")!.header,
];
