import type { ProductAttributeRow } from "@lib/data/product-attributes"

/**
 * Handles and article numbers are unique across the whole platform, so an imported shop's
 * codes end with the shop's own tag (`1199673895-CHERKASHINO`, handle `…-cherkashino`).
 * That tag is plumbing, not something a buyer should read. The rule knows no tenant: a
 * text value that ends with the same `-tag` as this product's handle loses it, and a
 * value that was nothing but the tag is dropped with its row.
 */
export const withoutShopTag = (
  value: string,
  handle?: string | null
): string => {
  const tag = handle?.split("-").pop()
  if (!tag || !/[a-z]/i.test(tag)) {
    return value
  }
  const suffix = `-${tag}`.toLowerCase()
  const lower = value.toLowerCase()
  if (lower === tag.toLowerCase()) {
    return ""
  }
  return lower.endsWith(suffix) ? value.slice(0, -suffix.length) : value
}

/**
 * The rows a buyer may see: shop tags removed from text values, and rows that were
 * nothing but a tag dropped. Computed once per page and handed to both the six-row
 * summary in the product card and the full table under it.
 */
export const prepareAttributeRows = (
  rows: ProductAttributeRow[],
  handle?: string | null
): ProductAttributeRow[] =>
  rows
    .map((row) =>
      row.type === "text" && typeof row.value === "string"
        ? { ...row, value: withoutShopTag(row.value, handle) }
        : row
    )
    .filter((row) => !(row.type === "text" && row.value === ""))

/** How many characteristics the product card shows before the «all» link takes over. */
export const SUMMARY_ROWS = 6

/**
 * The text of one value: yes/no for a flag in the visitor's words, the label of a choice,
 * a number with its unit.
 */
export const displayAttributeValue = (
  row: ProductAttributeRow,
  words: { yes: string; no: string }
): string => {
  if (row.type === "boolean") {
    return row.value ? words.yes : words.no
  }
  if (row.type === "select") {
    return row.label ?? String(row.value)
  }
  if (row.type === "number" && row.unit) {
    return `${row.value} ${row.unit}`
  }
  return String(row.value)
}
