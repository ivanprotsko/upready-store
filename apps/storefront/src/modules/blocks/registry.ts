import * as announcement from "./announcement"
import * as banner from "./banner"
import * as blog from "./blog"
import * as collage from "./collage"
import * as collection from "./collection"
import * as columns from "./columns"
import * as contacts from "./contacts"
import * as countdown from "./countdown"
import * as delivery from "./delivery"
import { EXISTING_BLOCKS } from "./existing"
import * as faq from "./faq"
import * as footer from "./footer"
import * as header from "./header"
import * as hero from "./hero"
import * as listing from "./listing"
import * as media from "./media"
import * as newsletter from "./newsletter"
import * as promo from "./promo"
import * as slideshow from "./slideshow"
import * as testimonials from "./testimonials"
import * as text from "./text"
import * as tiles from "./tiles"
import * as trust from "./trust"
import * as video from "./video"
import { BLOCK_CATEGORIES, type BlockCategory, type BlockEntry, type BlockId } from "./types"

/**
 * The block registry of the template programme (t-2026-10-12-33): every variant a template
 * may name, `docs/templates/BLOCK-CONTRACT.md`. The composition variants first, by
 * reference (`./existing.ts`), then the blocks written for templates, category by category
 * in the order of `BLOCK_CATEGORIES`, each category sorted by variant.
 *
 * A category is one file, `./<category>/index.ts`, one export line per block; a block PR
 * touches that file and its own folder, never this one. Every category is declared and
 * imported here already, and the `Record` below fails the type check when one is missing.
 * The order is the playground's order.
 */
const CATEGORY_FILES: Record<BlockCategory, object> = {
  header,
  hero,
  tiles,
  listing,
  footer,
  announcement,
  text,
  media,
  columns,
  collection,
  testimonials,
  newsletter,
  banner,
  collage,
  slideshow,
  faq,
  video,
  blog,
  promo,
  countdown,
  trust,
  delivery,
  contacts,
}

/**
 * Each category's blocks written for templates, sorted by variant: every export of its file
 * (`registry.test.ts` holds each one to its category and to the entry shape).
 */
export const CATEGORY_BLOCKS = {} as Record<BlockCategory, readonly BlockEntry[]>
for (const category of BLOCK_CATEGORIES) {
  const exported = Object.values(CATEGORY_FILES[category])
  const entries = exported.filter((value) => typeof value === "object" && value !== null) as BlockEntry[]
  CATEGORY_BLOCKS[category] = entries.sort((a, b) => (a.variant < b.variant ? -1 : a.variant > b.variant ? 1 : 0))
}

export const BLOCKS: readonly BlockEntry[] = [
  ...EXISTING_BLOCKS,
  ...BLOCK_CATEGORIES.flatMap((category) => CATEGORY_BLOCKS[category]),
]

const BY_ID = new Map<string, BlockEntry>(BLOCKS.map((block) => [block.id, block]))

export function blockById(id: string): BlockEntry | null {
  return BY_ID.get(id) ?? null
}

export const BLOCK_IDS: readonly BlockId[] = BLOCKS.map((block) => block.id)
