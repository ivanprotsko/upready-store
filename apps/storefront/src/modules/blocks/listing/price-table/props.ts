import type { PropsResult } from "../../types"
import type { LocalizedText } from "../../shared/localized-text"
import { parseEnum, parseInteger, parseList, parseLocalizedText, parseObject, parseProps } from "../../shared/parse"
import { parseSectionHeader, type SectionHeader } from "../../shared/section-header"

/**
 * Which products the list shows, exactly one of (the shape of `collection/featured`'s `source`):
 *
 * - `{ "category": "<handle>" }`: a category of the shop, its whole branch;
 * - `{ "collection": "<handle>" }`: a collection, the shop's own products in it;
 * - `{ "sort": "newest" }`: the whole catalogue, the newest first;
 * - `{ "sort": "title" }`: the whole catalogue from A to Z, the order of a printed price list.
 *
 * Both sorts are the store API's own `order` (`-created_at`, `title`). A price or a sales sort
 * is not: the API keeps no sales figures, and it orders prices only after the read.
 */
export type PriceTableSource = { category: string } | { collection: string } | { sort: "newest" | "title" }

/** The optional columns between the product and its price. */
export type PriceTableColumn = "sku" | "stock" | "unit"

/** The table's own words while the block is `lab` (BLOCK-CONTRACT.md §2). */
export type PriceTableLabels = {
  product: LocalizedText
  sku: LocalizedText
  stock: LocalizedText
  unit: LocalizedText
  price: LocalizedText
  quantity: LocalizedText
  /** Before the cheapest price of a product with several variants: «от 1 200 ₽». */
  from: LocalizedText
  addToCart: LocalizedText
  /** On the button for two seconds after an add. */
  added: LocalizedText
  /** The link of a product with several variants, to its page. */
  choose: LocalizedText
  inStock: LocalizedText
  /** Out of stock, and the shop takes orders for it anyway. */
  backorder: LocalizedText
  outOfStock: LocalizedText
  /** The stepper's buttons, for a screen reader. */
  decrease: LocalizedText
  increase: LocalizedText
}

export type PriceTableProps = {
  /** The shell's header. With no heading the section takes the category's or collection's name. */
  header: SectionHeader | null
  source: PriceTableSource
  /** How many products at most, 10 to 50. */
  limit: number
  /** Which of SKU, stock and unit stand between the product and its price, in this order. */
  columns: PriceTableColumn[]
  /**
   * The unit a row is sold in, «шт». The store keeps no sale unit on a product, so the template
   * names one for the whole list; it shows in the `unit` column.
   */
  unit: LocalizedText
  /** A line under the table: the minimum order, the terms. Optional. */
  note: LocalizedText
  labels: PriceTableLabels
}

/** The heading of a sort when the header has none. */
export const PRICE_LIST_HEADING: LocalizedText = { ru: "Прайс-лист", en: "Price list" }
export const UNIT: LocalizedText = { ru: "шт", en: "pcs" }

export const LABELS: PriceTableLabels = {
  product: { ru: "Товар", en: "Product" },
  sku: { ru: "Артикул", en: "SKU" },
  stock: { ru: "Наличие", en: "Stock" },
  unit: { ru: "Ед.", en: "Unit" },
  price: { ru: "Цена", en: "Price" },
  quantity: { ru: "Количество", en: "Quantity" },
  from: { ru: "от", en: "from" },
  addToCart: { ru: "В корзину", en: "Add to cart" },
  added: { ru: "Добавлено", en: "Added" },
  choose: { ru: "Выбрать", en: "Choose" },
  inStock: { ru: "В наличии", en: "In stock" },
  backorder: { ru: "Под заказ", en: "To order" },
  outOfStock: { ru: "Нет в наличии", en: "Out of stock" },
  decrease: { ru: "Меньше", en: "Fewer" },
  increase: { ru: "Больше", en: "More" },
}

export const COLUMNS = ["sku", "stock", "unit"] as const

const NEWEST: PriceTableSource = { sort: "newest" }

const KINDS = ["category", "collection", "sort"] as const

/**
 * A handle as Medusa writes one, the pattern of `shared/image-ref.ts`, which keeps its own
 * check private: lower case Latin or Cyrillic letters, digits, `-`, `_`, `.`.
 */
const HANDLE = /^[a-z0-9а-яё][a-z0-9а-яё._-]*$/

const handle = (value: unknown, path: string): PropsResult<string> =>
  typeof value === "string" && value.length <= 200 && HANDLE.test(value)
    ? { ok: true, value }
    : { ok: false, errors: [`${path} must be a handle of the shop (letters, digits, - and _)`] }

/** `source`: absent is the newest products of the whole catalogue. */
export function parsePriceTableSource(value: unknown, path: string): PropsResult<PriceTableSource> {
  if (value === undefined || value === null) return { ok: true, value: NEWEST }
  const given = typeof value === "object" && !Array.isArray(value) ? KINDS.filter((key) => key in value) : []
  if (given.length !== 1) {
    return { ok: false, errors: [`${path} must name exactly one of: ${KINDS.join(", ")}`] }
  }
  if (given[0] === "category") return parseObject<{ category: string }>(value, path, { category: handle })
  if (given[0] === "collection") return parseObject<{ collection: string }>(value, path, { collection: handle })
  return parseObject<{ sort: "newest" | "title" }>(value, path, {
    sort: (sort, sortPath) => parseEnum(sort, sortPath, ["newest", "title"] as const),
  })
}

/** `columns`: absent is SKU and stock; each at most once, drawn in the order of `COLUMNS`. */
export function parsePriceTableColumns(value: unknown, path: string): PropsResult<PriceTableColumn[]> {
  const list = parseList(value, path, (item, itemPath) => parseEnum(item, itemPath, COLUMNS), {
    max: COLUMNS.length,
    fallback: ["sku", "stock"],
  })
  if (!list.ok) return list
  const twice = list.value.filter((column, index) => list.value.indexOf(column) !== index)
  if (twice.length) return { ok: false, errors: [`${path} names ${twice[0]} twice`] }
  return { ok: true, value: COLUMNS.filter((column) => list.value.includes(column)) }
}

const label = (fallback: LocalizedText) => (value: unknown, path: string) =>
  parseLocalizedText(value, path, { max: 30, fallback })

/** `labels`: absent, or any field absent, is the block's Russian and English default. */
function parseLabels(value: unknown, path: string): PropsResult<PriceTableLabels> {
  const fields = Object.fromEntries(
    (Object.keys(LABELS) as (keyof PriceTableLabels)[]).map((key) => [key, label(LABELS[key])])
  ) as { [K in keyof PriceTableLabels]: ReturnType<typeof label> }
  return parseObject<PriceTableLabels>(value ?? {}, path, fields)
}

export function parsePriceTableProps(input: unknown): PropsResult<PriceTableProps> {
  return parseProps<PriceTableProps>(input, "listing/price-table", {
    header: (value, path) => parseSectionHeader(value, path),
    source: parsePriceTableSource,
    limit: (value, path) => parseInteger(value, path, { min: 10, max: 50, fallback: 20 }),
    columns: parsePriceTableColumns,
    unit: (value, path) => parseLocalizedText(value, path, { max: 12, fallback: UNIT }),
    note: (value, path) => parseLocalizedText(value, path, { max: 200, fallback: {} }),
    labels: parseLabels,
  })
}
