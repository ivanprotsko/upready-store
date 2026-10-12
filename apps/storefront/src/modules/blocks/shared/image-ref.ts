import type { PropsResult } from "../types"
import type { LocalizedText } from "./localized-text"
import { parseInteger, parseLocalizedText, parseObject } from "./parse"

/**
 * Where a block's picture comes from (BLOCK-CONTRACT.md §3), exactly one of:
 *
 * - `{ "product": "<handle>", "index"?: n }`: picture n (0 first) of one of the shop's own products;
 * - `{ "category": "<handle>" }`: the picture the owner gave a category in the panel;
 * - `{ "src": "/templates/<template-id>/<file>" }`: a file committed under `public/templates/`,
 *   made for us. No third-party image is ever committed.
 *
 * plus `alt`, the shop's words for it. `resolveImageRef` (`lib/data/block-image.ts`) turns one
 * into an address; a product or category that is not there answers null, and the block shows
 * its empty state.
 */
export type ImageRef =
  | { product: string; index: number; alt: LocalizedText }
  | { category: string; alt: LocalizedText }
  | { src: string; alt: LocalizedText }

/**
 * A handle as Medusa writes one, lower case: Latin or Cyrillic letters, digits, `-`, `_`, `.`;
 * `/` between category levels.
 */
const HANDLE = /^[a-z0-9а-яё][a-z0-9а-яё._-]*(?:\/[a-z0-9а-яё][a-z0-9а-яё._-]*)*$/

/** `/templates/<template-id>/<file>`, the id kebab-case as in the manifest, a raster image file. */
const TEMPLATE_FILE = /^\/templates\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9][a-z0-9_-]*(?:\.[a-z0-9_-]+)*\.(?:avif|webp|jpe?g|png)$/

const SOURCES = ["product", "category", "src"] as const

const handle = (value: unknown, path: string): PropsResult<string> =>
  typeof value === "string" && value.length <= 200 && HANDLE.test(value)
    ? { ok: true, value }
    : { ok: false, errors: [`${path} must be a handle of the shop (letters, digits, - and _)`] }

const alt = (value: unknown, path: string) => parseLocalizedText(value, path, { max: 200, fallback: {} })

export function parseImageRef(value: unknown, path: string): PropsResult<ImageRef>
export function parseImageRef(value: unknown, path: string, options: { optional: true }): PropsResult<ImageRef | null>
export function parseImageRef(
  value: unknown,
  path: string,
  options: { optional?: boolean } = {}
): PropsResult<ImageRef | null> {
  if (value === undefined || value === null) {
    return options.optional ? { ok: true, value: null } : { ok: false, errors: [`${path} is required`] }
  }
  const given =
    typeof value === "object" && !Array.isArray(value) ? SOURCES.filter((key) => key in value) : []
  if (given.length !== 1) {
    return { ok: false, errors: [`${path} must name exactly one of: ${SOURCES.join(", ")}`] }
  }
  if (given[0] === "product") {
    return parseObject<{ product: string; index: number; alt: LocalizedText }>(value, path, {
      product: handle,
      index: (v, p) => parseInteger(v, p, { min: 0, max: 19, fallback: 0 }),
      alt,
    })
  }
  if (given[0] === "category") {
    return parseObject<{ category: string; alt: LocalizedText }>(value, path, { category: handle, alt })
  }
  return parseObject<{ src: string; alt: LocalizedText }>(value, path, {
    src: (v, p) =>
      typeof v === "string" && TEMPLATE_FILE.test(v)
        ? { ok: true, value: v }
        : { ok: false, errors: [`${p} must be /templates/<template-id>/<file>.(avif|webp|jpg|png)`] },
    alt,
  })
}
