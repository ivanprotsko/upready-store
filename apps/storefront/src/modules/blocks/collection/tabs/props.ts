import type { PropsResult } from "../../types"
import type { LocalizedText } from "../../shared/localized-text"
import { parseInteger, parseList, parseLocalizedText, parseObject, parseProps } from "../../shared/parse"
import { parseSectionHeader, SEE_ALL_LABEL, type SectionHeader } from "../../shared/section-header"
import { NEWEST_HEADING, NEXT_LABEL, PREVIOUS_LABEL, parseFeaturedSource, type FeaturedSource } from "../featured/props"

/** One tab: its label and the products under it, a source of `collection/featured`'s shape. */
export type CollectionTab = {
  label: LocalizedText
  source: FeaturedSource
  /** How many products at most, 4 to 12. */
  limit: number
}

export type CollectionTabsProps = {
  /** The shell's header. With a single tab left and no heading, the tab's label is the heading. */
  header: SectionHeader | null
  /** 2 to 4 tabs, in order; a tab whose source holds no product is dropped. */
  tabs: CollectionTab[]
  /** Cards in a row from 1024 px, 3 to 5; two and an edge on a phone, three and an edge from 720 px. */
  columns: number
  /** The link to the chosen tab's source. */
  seeAllLabel: LocalizedText
  /** The carousel arrows' names for a screen reader. */
  previousLabel: LocalizedText
  nextLabel: LocalizedText
}

/**
 * What the panel asks the server for when a tab opens (`load.tsx`): the tab's source and limit
 * and the carousel's settings. It comes back from the browser, so the action parses it again.
 */
export type TabRequest = {
  source: FeaturedSource
  limit: number
  columns: number
  previousLabel: LocalizedText
  nextLabel: LocalizedText
}

export const BESTSELLERS_LABEL: LocalizedText = { ru: "Хиты", en: "Bestsellers" }

/**
 * The tabs of a template that names the block without props: the lead collection of the
 * launch profiles (`bestsellers`, `getLeadCollection` in `lib/data/home.ts`) and the newest of
 * the catalogue. A shop with no such collection keeps the newest alone, drawn as
 * `collection/featured` would draw it.
 */
export const DEFAULT_TABS: CollectionTab[] = [
  { label: BESTSELLERS_LABEL, source: { collection: "bestsellers" }, limit: 8 },
  { label: NEWEST_HEADING, source: { sort: "newest" }, limit: 8 },
]

const limitOf = (value: unknown, path: string) => parseInteger(value, path, { min: 4, max: 12, fallback: 8 })
const columnsOf = (value: unknown, path: string) => parseInteger(value, path, { min: 3, max: 5, fallback: 4 })
const arrowLabel = (fallback: LocalizedText) => (value: unknown, path: string) =>
  parseLocalizedText(value, path, { max: 30, fallback })

/** A tab's label: words in at least one language, 24 characters at most, so four fit a row. */
function parseTabLabel(value: unknown, path: string): PropsResult<LocalizedText> {
  const result = parseLocalizedText(value, path, { max: 24 })
  if (!result.ok) return result
  return Object.values(result.value).some((line) => line.trim())
    ? result
    : { ok: false, errors: [`${path} needs words in at least one language`] }
}

const parseTab = (value: unknown, path: string) =>
  parseObject<CollectionTab>(value, path, { label: parseTabLabel, source: parseFeaturedSource, limit: limitOf })

export function parseCollectionTabsProps(input: unknown): PropsResult<CollectionTabsProps> {
  return parseProps<CollectionTabsProps>(input, "collection/tabs", {
    header: (value, path) => parseSectionHeader(value, path),
    tabs: (value, path) => parseList(value, path, parseTab, { min: 2, max: 4, fallback: DEFAULT_TABS }),
    columns: columnsOf,
    seeAllLabel: (value, path) => parseLocalizedText(value, path, { max: 30, fallback: SEE_ALL_LABEL }),
    previousLabel: arrowLabel(PREVIOUS_LABEL),
    nextLabel: arrowLabel(NEXT_LABEL),
  })
}

/** The action's own check of a `TabRequest`, with the parsers of the props. */
export const parseTabRequest = (input: unknown): PropsResult<TabRequest> =>
  parseObject<TabRequest>(input, "tab", {
    source: parseFeaturedSource,
    limit: limitOf,
    columns: columnsOf,
    previousLabel: arrowLabel(PREVIOUS_LABEL),
    nextLabel: arrowLabel(NEXT_LABEL),
  })
