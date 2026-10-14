import type {
  ProductAttribute,
  ProductAttributeBody,
  ProductAttributeOptionBody,
} from "../../hooks/api/product-attributes"
import { OPTION_VALUE_PATTERN } from "./attribute-labels.ts"

/**
 * t-2026-10-14-01 (panel redesign, G2): the data rules of the characteristic
 * screens, free of React so `src/__tests__/product-attributes-g2.test.mjs`
 * runs them as is.
 *
 * The backend saves a characteristic whole: `POST /tenants/product-attributes/:id`
 * needs the name and the type, and replaces the list of values with the one it
 * is sent. The card edits that one record from three drawers, so each drawer
 * sends the saved record with its own fields on top (`attributeBody`), and
 * none can drop what another section holds.
 */

/** The category Select's value for «Весь каталог»: Radix Select has no empty value. */
export const ALL_CATALOG = "__all__"

/** The machine value of the first value a new choice list starts with. */
export const STARTER_OPTION_VALUE = "znachenie_1"

/** Only the languages that carry text: an empty field means «as the name». */
export const cleanTranslations = (source: Record<string, string> | undefined) =>
  Object.fromEntries(
    Object.entries(source ?? {})
      .map(([code, value]) => [code, (value ?? "").trim()] as const)
      .filter(([, value]) => value.length > 0)
  )

const optionBodies = (attribute: ProductAttribute): ProductAttributeOptionBody[] =>
  [...attribute.options]
    .sort((a, b) => a.position - b.position)
    .map((option) => ({
      value: option.value,
      label: option.label,
      translations: cleanTranslations(option.translations),
    }))

/**
 * The whole record to send: the saved one with `patch` on top. A choice list
 * always goes with its values; one that has none yet (the type was just
 * switched to a list) gets the starter value the create also sends.
 */
export const attributeBody = (
  saved: ProductAttribute,
  patch: Partial<ProductAttributeBody>,
  starterLabel: string
): ProductAttributeBody => {
  const type = patch.type ?? saved.type
  const body: ProductAttributeBody = {
    name: (patch.name ?? saved.name).trim(),
    translations: cleanTranslations(patch.translations ?? saved.translations),
    type,
    unit: patch.unit !== undefined ? patch.unit : saved.unit,
    position: patch.position ?? saved.position,
    category_id: patch.category_id !== undefined ? patch.category_id : saved.category_id,
    show_on_product: patch.show_on_product ?? saved.show_on_product,
    use_as_filter: patch.use_as_filter ?? saved.use_as_filter,
  }
  if (type === "select") {
    const options = patch.options ?? optionBodies(saved)
    body.options = options.length
      ? options
      : [{ value: STARTER_OPTION_VALUE, label: starterLabel, translations: {} }]
  }
  return body
}

/** A key under `productAttributes.values.errors` in the catalogs. */
export type OptionsProblem = "empty" | "incomplete" | "duplicate"

/** What the values drawer refuses before asking the server, or `null`. */
export const optionsProblem = (
  options: { value: string; label: string }[]
): OptionsProblem | null => {
  if (!options.length) {
    return "empty"
  }
  if (options.some((option) => !option.label.trim() || !OPTION_VALUE_PATTERN.test(option.value.trim()))) {
    return "incomplete"
  }
  const values = options.map((option) => option.value.trim())
  return new Set(values).size === values.length ? null : "duplicate"
}

/** The list's search (name or machine name, without case) and page, from the URL. */
export const attributeListPage = (
  rows: ProductAttribute[],
  { q, offset = 0, limit }: { q?: string; offset?: number; limit: number }
): { rows: ProductAttribute[]; count: number } => {
  const needle = q?.trim().toLowerCase() ?? ""
  const matched = needle
    ? rows.filter(
        (row) => row.name.toLowerCase().includes(needle) || row.key.toLowerCase().includes(needle)
      )
    : rows
  const start = Number.isFinite(offset) && offset > 0 ? offset : 0
  return { rows: matched.slice(start, start + limit), count: matched.length }
}
