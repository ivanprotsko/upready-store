import type { PropsResult } from "../../types"
import type { LocalizedText } from "../../shared/localized-text"
import { parseEnum, parseInteger, parseLocalizedText, parseObject, parseProps } from "../../shared/parse"
import { parseSectionHeader, type SectionHeader } from "../../shared/section-header"

/**
 * Which products the section shows, exactly one of:
 *
 * - `{ "category": "<handle>" }`: a category of the shop;
 * - `{ "collection": "<handle>" }`: a collection, the shop's own products in it;
 * - `{ "sort": "newest" }`: the whole catalogue, the newest first.
 *
 * `"bestsellers"` is not a sort here: the store API keeps no sales figures on a product, so
 * nothing could rank by them.
 */
export type FeaturedSource = { category: string } | { collection: string } | { sort: "newest" }

export type FeaturedCollectionProps = {
  /** The shell's header. With no heading the section takes the category's or collection's name. */
  header: SectionHeader | null
  source: FeaturedSource
  /** How many products at most, 4 to 12. */
  limit: number
  /** `carousel`: one row that scrolls, snapping to a card; arrows from 1024 px. */
  layout: "grid" | "carousel"
  /** Cards in a row from 1024 px, 3 to 5; two on a phone and three from 720 px. */
  columns: number
  /** The carousel arrows' names for a screen reader. */
  previousLabel: LocalizedText
  nextLabel: LocalizedText
}

/** The heading of `{ sort: "newest" }` when the header has none (BLOCK-CONTRACT.md §2). */
export const NEWEST_HEADING: LocalizedText = { ru: "Новинки", en: "New arrivals" }
export const PREVIOUS_LABEL: LocalizedText = { ru: "Назад", en: "Previous" }
export const NEXT_LABEL: LocalizedText = { ru: "Вперёд", en: "Next" }

const NEWEST: FeaturedSource = { sort: "newest" }

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
export function parseFeaturedSource(value: unknown, path: string): PropsResult<FeaturedSource> {
  if (value === undefined || value === null) return { ok: true, value: NEWEST }
  const given = typeof value === "object" && !Array.isArray(value) ? KINDS.filter((key) => key in value) : []
  if (given.length !== 1) {
    return { ok: false, errors: [`${path} must name exactly one of: ${KINDS.join(", ")}`] }
  }
  if (given[0] === "category") return parseObject<{ category: string }>(value, path, { category: handle })
  if (given[0] === "collection") return parseObject<{ collection: string }>(value, path, { collection: handle })
  return parseObject<{ sort: "newest" }>(value, path, {
    sort: (sort, sortPath) => parseEnum(sort, sortPath, ["newest"] as const),
  })
}

export function parseFeaturedCollectionProps(input: unknown): PropsResult<FeaturedCollectionProps> {
  return parseProps<FeaturedCollectionProps>(input, "collection/featured", {
    header: (value, path) => parseSectionHeader(value, path),
    source: parseFeaturedSource,
    limit: (value, path) => parseInteger(value, path, { min: 4, max: 12, fallback: 8 }),
    layout: (value, path) => parseEnum(value, path, ["grid", "carousel"] as const, { fallback: "grid" }),
    columns: (value, path) => parseInteger(value, path, { min: 3, max: 5, fallback: 4 }),
    previousLabel: (value, path) => parseLocalizedText(value, path, { max: 30, fallback: PREVIOUS_LABEL }),
    nextLabel: (value, path) => parseLocalizedText(value, path, { max: 30, fallback: NEXT_LABEL }),
  })
}
