/**
 * The column contract of the catalogue spreadsheet (t14-product-import). The
 * export writes exactly these headers and the import accepts exactly these
 * headers, which is what makes "export, edit in Excel, import back" a round
 * trip rather than two formats that happen to look alike.
 *
 * Headers are RUSSIAN, because the person editing the file is the shop owner,
 * not an integrator: the file has to be readable in the Excel row they opened
 * it in. Every header also has technical aliases, so a list assembled by a
 * developer, exported from another system or typed in English still imports.
 * Matching is case-insensitive and ignores surrounding whitespace and the
 * invisible characters spreadsheets like to leave behind.
 *
 * ONE ROW PER VARIANT. The product-level columns repeat on every row of the
 * same `Код товара`; the first row of a handle is the one that decides them.
 * A shop with 38 single-variant positions therefore gets 38 rows, which is the
 * shape a price list already has.
 */

/** Product-level and variant-level fields with a fixed header. */
export type FixedColumnId =
  | "handle"
  | "title"
  | "subtitle"
  | "description"
  | "status"
  | "category"
  | "variant_title"
  | "sku"
  | "stock"
  | "weight"
  | "length"
  | "width"
  | "height"
  | "images";

export type ColumnSpec = {
  id: FixedColumnId;
  /** What the export writes and the panel documents. */
  header: string;
  /** Also accepted on import, lowercased. */
  aliases: string[];
  /** Product-level columns are read from the first row of a handle. */
  level: "product" | "variant";
};

export const FIXED_COLUMNS: ColumnSpec[] = [
  {
    id: "handle",
    header: "Код товара",
    aliases: ["handle", "product handle", "код", "идентификатор", "url", "слаг", "slug"],
    level: "product",
  },
  {
    id: "title",
    header: "Название",
    aliases: ["title", "product title", "name", "наименование", "товар"],
    level: "product",
  },
  {
    id: "subtitle",
    header: "Подзаголовок",
    aliases: ["subtitle", "product subtitle"],
    level: "product",
  },
  {
    id: "description",
    header: "Описание",
    aliases: ["description", "product description", "текст"],
    level: "product",
  },
  {
    id: "status",
    header: "Статус",
    aliases: ["status", "product status", "состояние"],
    level: "product",
  },
  {
    id: "category",
    header: "Категория",
    aliases: ["category", "categories", "категории", "раздел", "путь категории"],
    level: "product",
  },
  {
    id: "variant_title",
    header: "Вариант",
    aliases: ["variant", "variant title", "вариант товара", "опция", "фасовка"],
    level: "variant",
  },
  {
    id: "sku",
    header: "SKU",
    aliases: ["sku", "variant sku", "артикул", "артикул варианта", "код варианта"],
    level: "variant",
  },
  {
    id: "stock",
    header: "Остаток",
    aliases: ["stock", "quantity", "inventory", "inventory quantity", "количество", "склад"],
    level: "variant",
  },
  {
    id: "weight",
    header: "Вес, г",
    aliases: ["weight", "вес", "вес, г", "вес (г)", "вес грамм"],
    level: "variant",
  },
  {
    id: "length",
    header: "Длина, мм",
    aliases: ["length", "длина", "длина, мм"],
    level: "variant",
  },
  {
    id: "width",
    header: "Ширина, мм",
    aliases: ["width", "ширина", "ширина, мм"],
    level: "variant",
  },
  {
    id: "height",
    header: "Высота, мм",
    aliases: ["height", "высота", "высота, мм"],
    level: "variant",
  },
  {
    id: "images",
    header: "Картинки",
    aliases: ["images", "image urls", "картинки", "фото", "изображения", "ссылки на фото"],
    level: "product",
  },
];

/** `Цена, RUB` — one column per currency the shop prices in. */
export const priceHeader = (currencyCode: string): string =>
  `Цена, ${currencyCode.toUpperCase()}`;

/** `Метаданные: ключ` — one column per product metadata key the shop uses. */
export const metadataHeader = (key: string): string => `Метаданные: ${key}`;

/**
 * One metadata value as a cell. The export writes it and the dry run compares
 * against it, and both HAVE to use this function: a value that is an object
 * (Medusa's `metadata` is free-form JSON) stringifies to `[object Object]`
 * through the default coercion, which made every product with a JSON metadata
 * key read as "changed" on a round trip with no edits — the one thing the
 * feature promises cannot happen (measured on the stand 2026-09-15, 10 of 10
 * lead rows reported as updates).
 */
export const metadataCell = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
};

/** The separator between image URLs inside one cell, and what is accepted back. */
export const IMAGE_SEPARATOR = " | ";

/**
 * A header cell, reduced to what it means. Excel and Google Sheets both leave
 * non-breaking spaces and zero-width characters in a hand-edited header, and a
 * column that "looks right" but does not match is the worst failure this
 * feature can have, so they go before anything is compared.
 */
export const normalizeHeader = (raw: string): string =>
  raw
    .replace(/[\uFEFF\u200B-\u200D\u2060]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export type ResolvedColumn =
  | { kind: "fixed"; id: FixedColumnId }
  | { kind: "price"; currency_code: string }
  | { kind: "metadata"; key: string }
  | { kind: "unknown" };

const FIXED_BY_HEADER = new Map<string, FixedColumnId>();

for (const column of FIXED_COLUMNS) {
  FIXED_BY_HEADER.set(normalizeHeader(column.header), column.id);
  for (const alias of column.aliases) {
    FIXED_BY_HEADER.set(normalizeHeader(alias), column.id);
  }
}

const PRICE_PATTERNS = [
  /^цена[,\s]*([a-zа-я]{3})$/i,
  /^price[,\s_-]*([a-z]{3})$/i,
  /^цена\s*\(([a-zа-я]{3})\)$/i,
];

const METADATA_PATTERNS = [
  /^метаданные\s*:\s*(.+)$/i,
  /^метаданные\s+(.+)$/i,
  /^metadata\s*[:.]\s*(.+)$/i,
];

/**
 * What one header cell is. Unknown columns are not an error: a price list
 * carries the owner's own notes ("поставщик", "закупка") and an import that
 * refused them would make the feature useless. They are reported, and ignored.
 */
export const resolveColumn = (raw: string): ResolvedColumn => {
  const normalized = normalizeHeader(raw);

  if (normalized === "") {
    return { kind: "unknown" };
  }

  const fixed = FIXED_BY_HEADER.get(normalized);
  if (fixed) {
    return { kind: "fixed", id: fixed };
  }

  for (const pattern of PRICE_PATTERNS) {
    const match = normalized.match(pattern);
    if (match) {
      return { kind: "price", currency_code: match[1].toLowerCase() };
    }
  }

  for (const pattern of METADATA_PATTERNS) {
    const match = normalized.match(pattern);
    if (match) {
      return { kind: "metadata", key: match[1].trim() };
    }
  }

  return { kind: "unknown" };
};

/** The two statuses the panel offers, plus what a shop owner types instead. */
const STATUS_BY_WORD = new Map<string, "draft" | "published" | "proposed" | "rejected">([
  ["draft", "draft"],
  ["черновик", "draft"],
  ["скрыт", "draft"],
  ["выключен", "draft"],
  ["нет", "draft"],
  ["published", "published"],
  ["опубликован", "published"],
  ["опубликовано", "published"],
  ["активен", "published"],
  ["включен", "published"],
  ["да", "published"],
  ["proposed", "proposed"],
  ["rejected", "rejected"],
]);

export const parseStatus = (raw: string): "draft" | "published" | "proposed" | "rejected" | null =>
  STATUS_BY_WORD.get(normalizeHeader(raw)) ?? null;

/**
 * `1,234` is refused, and that refusal is the point.
 *
 * To a Russian Excel it is one and 234 thousandths; to an American one it is
 * one thousand two hundred thirty-four. Both spellings reach this parser from
 * real files, the difference is a factor of a thousand, and the mistake lands
 * on a live shop's price tag. There is no safe default, so the one ambiguous
 * shape — a comma followed by EXACTLY three digits, with nothing after it —
 * is reported and the owner is asked which they meant. `1 234`, `1234.5` and
 * `1990,50` are all unambiguous and pass.
 */
const AMBIGUOUS_THOUSANDS = /^\d{1,3},\d{3}$/;

export const isAmbiguousNumber = (raw: string): boolean =>
  AMBIGUOUS_THOUSANDS.test(raw.replace(/\u00A0/g, " ").replace(/[₽$€]/g, "").replace(/\s/g, ""));

/**
 * A number as a spreadsheet writes it: `1 990,50`, `1990.5`, `1 990,50 ₽`, or
 * with the non-breaking space Excel uses as a thousands separator. Returns
 * `null` for anything that is not a number, which is how a price with letters
 * in it becomes a rejected row instead of a silent zero (rule 20a: a value
 * substituted for an absence is worse than the absence).
 */
export const parseNumber = (raw: string): number | null => {
  const cleaned = raw
    .replace(/\u00A0/g, " ")
    .replace(/[₽$€]/g, "")
    .replace(/\s/g, "")
    .replace(",", ".")
    .trim();

  if (cleaned === "") {
    return null;
  }

  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return null;
  }

  return Number(cleaned);
};

/** The category path separator, `Добавки / АСД`. Both slashes are accepted. */
export const splitCategoryPath = (raw: string): string[] =>
  raw
    .split(/[/>»]|\\/)
    .map((part) => part.replace(/\u00A0/g, " ").trim())
    .filter((part) => part !== "");

export const joinCategoryPath = (parts: string[]): string => parts.join(" / ");

/**
 * Image URLs in one cell: `|`, a newline or a comma between them. A semicolon
 * is deliberately NOT a separator here: it is the CSV separator Excel writes,
 * so a cell that carries one carries it inside quotes and on purpose.
 */
export const splitImageUrls = (raw: string): string[] =>
  raw
    .split(/[|\n,]/)
    .map((part) => part.trim())
    .filter((part) => part !== "");
