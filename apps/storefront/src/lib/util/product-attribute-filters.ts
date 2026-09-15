/**
 * The catalogue filter on a shop's own characteristics, as it is spelled in the
 * URL (t15-product-attributes).
 *
 * One query parameter per characteristic, named `a_<key>` after its machine
 * key, so a bookmarked filter keeps working after the owner renames the label:
 *
 *   /store?a_sostav=Магний&a_sostav=Травы   a choice or a text, one param each
 *   /store?a_obem=100..500                   a number: an inclusive range
 *   /store?a_obem=..500                      one end left open
 *   /store?a_organic=true                    a yes/no
 *
 * A value is NEVER split on a comma — «Трава, витамин C» is one composition —
 * so several values are several parameters, the same spelling
 * `optionValueIds` already uses here. The backend reads this format in
 * `apps/backend/src/api/store/tenant/product-attributes/selection.ts`, and that
 * file and this one are the two ends of it.
 */

export const ATTRIBUTE_PARAM_PREFIX = "a_"

export const RANGE_SEPARATOR = ".."

/** `{ "<key>": ["<raw value>", …] }`, exactly as the URL carries it. */
export type AttributeSelection = Record<string, string[]>

type ReadonlySearchParams = {
  entries?: () => IterableIterator<[string, string]>
  getAll?: (name: string) => string[]
  keys?: () => IterableIterator<string>
}

// `Array.from` rather than `for…of` over the iterable: the storefront's
// tsconfig targets ES5 iteration semantics and rejects the latter.
const fromEntries = (entries: Iterable<[string, string]>): AttributeSelection => {
  const selection: AttributeSelection = {}

  for (const [name, value] of Array.from(entries)) {
    if (!name.startsWith(ATTRIBUTE_PARAM_PREFIX) || !value) {
      continue
    }
    const key = name.slice(ATTRIBUTE_PARAM_PREFIX.length)
    selection[key] = [...(selection[key] ?? []), value]
  }

  return selection
}

/**
 * Reads the selection out of a `URLSearchParams` (the client components) or out
 * of Next's own `searchParams` object (the server ones). Both shapes reach this
 * file, so both are handled here rather than at every call site.
 */
export const parseAttributeSelection = (
  searchParams:
    | ReadonlySearchParams
    | Record<string, string | string[] | undefined>
    | undefined
): AttributeSelection => {
  if (!searchParams) {
    return {}
  }

  const asParams = searchParams as ReadonlySearchParams
  if (typeof asParams.entries === "function") {
    return fromEntries(asParams.entries())
  }

  const plain = searchParams as Record<string, string | string[] | undefined>
  const entries: [string, string][] = []
  for (const [name, value] of Object.entries(plain)) {
    if (value === undefined) {
      continue
    }
    for (const item of Array.isArray(value) ? value : [value]) {
      entries.push([name, item])
    }
  }

  return fromEntries(entries)
}

/** `a_obem=100..500` → `{ min: 100, max: 500 }`; an absent end is `null`. */
export const parseRangeValue = (
  raw: string | undefined
): { min: number | null; max: number | null } => {
  if (!raw) {
    return { min: null, max: null }
  }

  const [from, to] = raw.includes(RANGE_SEPARATOR)
    ? raw.split(RANGE_SEPARATOR)
    : [raw, raw]

  const toNumber = (value: string | undefined) => {
    const trimmed = (value ?? "").trim()
    if (trimmed === "") {
      return null
    }
    const parsed = Number(trimmed.replace(",", "."))
    return Number.isFinite(parsed) ? parsed : null
  }

  return { min: toNumber(from), max: toNumber(to) }
}

/** `{ min, max }` → `100..500`, or an empty string when both ends are open. */
export const formatRangeValue = (
  min: number | null,
  max: number | null
): string => {
  if (min === null && max === null) {
    return ""
  }
  return `${min ?? ""}${RANGE_SEPARATOR}${max ?? ""}`
}

/**
 * Rewrites one characteristic's parameters in a `URLSearchParams`, leaving
 * every other parameter of the URL alone. An empty list REMOVES the filter,
 * which is what «сбросить» does.
 */
export const applyAttributeValues = (
  params: URLSearchParams,
  key: string,
  values: string[]
): void => {
  const name = `${ATTRIBUTE_PARAM_PREFIX}${key}`
  params.delete(name)
  for (const value of values) {
    if (value) {
      params.append(name, value)
    }
  }
}

/** The selection in the shape the backend's facets route takes as a query. */
export const toFacetQuery = (
  selection: AttributeSelection
): Record<string, string[]> =>
  Object.fromEntries(
    Object.entries(selection)
      .filter(([, values]) => values.length)
      .map(([key, values]) => [`${ATTRIBUTE_PARAM_PREFIX}${key}`, values])
  )

export const hasAttributeSelection = (selection: AttributeSelection): boolean =>
  Object.values(selection).some((values) => values.length > 0)
