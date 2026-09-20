import type { ProductAttributeType } from "../../hooks/api/product-attributes"

/**
 * The words the owner's screens use for a characteristic (t15-product-attributes).
 *
 * A type is an enum in the database and never reaches a screen as one: every
 * place that shows `type` goes through `TYPE_LABELS`, and every place that
 * shows a yes/no value goes through `booleanLabel`. The panel is Russian
 * throughout, the way the journal and the pages screens are.
 */

export const ATTRIBUTE_TYPES: ProductAttributeType[] = [
  "text",
  "number",
  "select",
  "boolean",
]

export const TYPE_LABELS: Record<ProductAttributeType, string> = {
  text: "Текст",
  number: "Число",
  select: "Выбор из списка",
  boolean: "Да / нет",
}

export const TYPE_HINTS: Record<ProductAttributeType, string> = {
  text: "Произвольная строка: состав, артикул, описание сырья.",
  number: "Число с единицей: объём, вес, длина. Только по числу работает фильтр «от и до».",
  select: "Закрытый список значений: страна, вкус, форма выпуска.",
  boolean: "Признак: гипоаллергенно, есть в наличии, подходит детям.",
}

export const booleanLabel = (value: boolean): string => (value ? "Да" : "Нет")

/** Lowercase latin letters, digits and single underscores, 2 to 40 characters. */
export const ATTRIBUTE_KEY_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/

export const isValidAttributeKey = (value: string): boolean =>
  value.length >= 2 && value.length <= 40 && ATTRIBUTE_KEY_PATTERN.test(value)

/** Lowercase latin letters, digits, single hyphens or underscores. */
export const OPTION_VALUE_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/

/**
 * A machine value suggested from the label the owner typed: «Россия» → `rossiya`.
 * Only a suggestion — the field stays editable, because the value is what a
 * filter URL and a CSV column carry and the owner may already have one.
 */
const TRANSLITERATION: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
}

export const suggestMachineValue = (label: string): string =>
  label
    .trim()
    .toLowerCase()
    .split("")
    .map((character) => TRANSLITERATION[character] ?? character)
    .join("")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
