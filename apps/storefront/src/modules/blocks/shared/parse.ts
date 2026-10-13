import type { PropsResult } from "../types"
import { LOCALE_CODES, type LocalizedText } from "./localized-text"

/**
 * The props parsers every block shares (t-2026-10-12-33, BLOCK-CONTRACT.md §2). Each takes the
 * raw value and the path it stands at and answers `{ ok: true, value }` or `{ ok: false, errors }`,
 * every error prefixed by that path, so a block's `parseProps` is one `parseProps(…)` call that
 * lists its fields:
 *
 *     parseProps<TextBarProps>(input, "announcement/text-bar", {
 *       text: (value, path) => parseLocalizedText(value, path, { max: 140 }),
 *       href: (value, path) => parseHref(value, path),
 *     })
 *
 * Pure, no I/O: the manifest validator runs them, and so do the tests.
 */

export type Parser<T> = (value: unknown, path: string) => PropsResult<T>

/** One parser per field, every field listed, the optional ones too. */
export type Fields<T> = { [K in keyof T]-?: Parser<T[K]> }

const ok = <T>(value: T): PropsResult<T> => ({ ok: true, value })
const fail = (...errors: string[]): PropsResult<never> => ({ ok: false, errors })

/** `text` under `items[0]` is `items[0].text`; at the top it is `text`. */
export const at = (path: string, key: string | number): string =>
  typeof key === "number" ? `${path}[${key}]` : path ? `${path}.${key}` : key

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

function readFields<T>(
  input: Record<string, unknown>,
  path: string,
  fields: Fields<T>,
  stranger: (key: string) => string
): PropsResult<T> {
  const errors: string[] = []
  const value: Partial<T> = {}
  for (const key of Object.keys(fields) as (keyof T & string)[]) {
    const result = fields[key](input[key], at(path, key))
    if (result.ok) value[key] = result.value
    else errors.push(...result.errors)
  }
  for (const key of Object.keys(input)) if (!(key in fields)) errors.push(stranger(key))
  return errors.length ? fail(...errors) : ok(value as T)
}

/** A block's whole props. Absent props are `{}`, so a block whose fields all have defaults needs none. */
export function parseProps<P>(input: unknown, blockId: string, fields: Fields<P>): PropsResult<P> {
  const value = input ?? {}
  if (!isRecord(value)) {
    return fail(`props must be an object { ${Object.keys(fields).join(", ")} }`)
  }
  return readFields(value, "", fields, (key) => `${key}: not a prop of ${blockId}`)
}

/** A nested object: a list item, a button, a section header. Absent is null when `optional`. */
export function parseObject<T>(value: unknown, path: string, fields: Fields<T>): PropsResult<T>
export function parseObject<T>(
  value: unknown,
  path: string,
  fields: Fields<T>,
  options: { optional: true }
): PropsResult<T | null>
export function parseObject<T>(
  value: unknown,
  path: string,
  fields: Fields<T>,
  options: { optional?: boolean } = {}
): PropsResult<T | null> {
  if (value === undefined || value === null) {
    return options.optional ? ok(null) : fail(`${path} is required`)
  }
  if (!isRecord(value)) return fail(`${path} must be an object { ${Object.keys(fields).join(", ")} }`)
  return readFields(value, path, fields, (key) => `${at(path, key)}: not a field of ${path}`)
}

/** A list of items, each read by `item` under `path[i]`. Absent is `fallback`, else an error. */
export function parseList<T>(
  value: unknown,
  path: string,
  item: Parser<T>,
  { min = 0, max, fallback }: { min?: number; max: number; fallback?: T[] }
): PropsResult<T[]> {
  if (value === undefined || value === null) {
    return fallback ? ok(fallback) : fail(`${path} is required`)
  }
  if (!Array.isArray(value)) return fail(`${path} must be a list`)
  const errors: string[] = []
  if (value.length < min) errors.push(`${path} has ${value.length} items, at least ${min}`)
  if (value.length > max) errors.push(`${path} has ${value.length} items, at most ${max}`)
  const items: T[] = []
  value.forEach((raw, index) => {
    const result = item(raw, at(path, index))
    if (result.ok) items.push(result.value)
    else errors.push(...result.errors)
  })
  return errors.length ? fail(...errors) : ok(items)
}

/**
 * The shop's words, `{ "<locale>": "…" }`, each at most `max` characters. Absent is `fallback`:
 * the block's Russian and English default for its own chrome, `{}` for an optional text, and
 * without one the text is required.
 */
export function parseLocalizedText(
  value: unknown,
  path: string,
  { max, fallback }: { max: number; fallback?: LocalizedText }
): PropsResult<LocalizedText> {
  if ((value === undefined || value === null) && fallback) return ok(fallback)
  if (!isRecord(value)) return fail(`${path} must be an object of language code to string`)
  const errors: string[] = []
  for (const [code, line] of Object.entries(value)) {
    if (!LOCALE_CODES.has(code)) errors.push(`${at(path, code)}: not a language of i18n/config.ts`)
    if (typeof line !== "string") errors.push(`${at(path, code)} must be a string`)
    else if (line.length > max) errors.push(`${at(path, code)} is ${line.length} characters, at most ${max}`)
  }
  return errors.length ? fail(...errors) : ok(value as LocalizedText)
}

/**
 * A link: a path inside the shop (`/store`; the locale is added when it is drawn) or an
 * `https://` address. `//host` and `/\host` are other sites dressed as paths, so they are
 * refused. Absent is null, unless `required`.
 */
export function parseHref(value: unknown, path: string): PropsResult<string | null>
export function parseHref(value: unknown, path: string, options: { required: true }): PropsResult<string>
export function parseHref(
  value: unknown,
  path: string,
  options: { required?: boolean } = {}
): PropsResult<string | null> {
  if (value === undefined || value === null) return options.required ? fail(`${path} is required`) : ok(null)
  if (typeof value !== "string" || !(value.startsWith("/") || value.startsWith("https://"))) {
    return fail(`${path} must start with / or https://`)
  }
  if (/^\/[/\\]/.test(value)) return fail(`${path}: ${value.slice(0, 2)} leads to another site; write https://`)
  if (value.length > 2048 || /\s/.test(value)) return fail(`${path} must be one address, no spaces, at most 2048 characters`)
  if (value.startsWith("https://")) {
    try {
      new URL(value)
    } catch {
      return fail(`${path} is not an address`)
    }
  }
  return ok(value)
}

/** One of `allowed`. Absent is `fallback`, else an error. */
export function parseEnum<T extends string>(
  value: unknown,
  path: string,
  allowed: readonly T[],
  { fallback }: { fallback?: T } = {}
): PropsResult<T> {
  if ((value === undefined || value === null) && fallback !== undefined) return ok(fallback)
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? ok(value as T)
    : fail(`${path} must be one of: ${allowed.join(", ")}`)
}

/**
 * A whole number from `min` to `max`. Absent is `fallback`, else an error. Not `parseInt`, so
 * that a block importing it never shadows the global.
 */
export function parseInteger(
  value: unknown,
  path: string,
  { min, max, fallback }: { min: number; max: number; fallback?: number }
): PropsResult<number> {
  if ((value === undefined || value === null) && fallback !== undefined) return ok(fallback)
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
    ? ok(value)
    : fail(`${path} must be a whole number from ${min} to ${max}`)
}

/** `true` or `false`. Absent is `fallback`. */
export function parseBoolean(value: unknown, path: string, { fallback }: { fallback: boolean }): PropsResult<boolean> {
  if (value === undefined || value === null) return ok(fallback)
  return typeof value === "boolean" ? ok(value) : fail(`${path} must be true or false`)
}
