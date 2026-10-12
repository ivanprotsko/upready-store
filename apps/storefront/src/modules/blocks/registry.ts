import { textBar } from "./announcement/text-bar/block"
import { EXISTING_BLOCKS } from "./existing"
import type { BlockEntry, BlockId } from "./types"

/**
 * The block registry of the template programme (t-2026-10-12-33): every variant a template
 * may name, `docs/templates/BLOCK-CONTRACT.md`. The composition variants first, by
 * reference (`./existing.ts`), then the blocks written for templates, one import per
 * block, each next to its component (`./<category>/<variant>/block.ts`).
 *
 * A new block is one line here. The order is the playground's order.
 */
export const BLOCKS: readonly BlockEntry[] = [...EXISTING_BLOCKS, textBar as BlockEntry]

const BY_ID = new Map<string, BlockEntry>(BLOCKS.map((block) => [block.id, block]))

export function blockById(id: string): BlockEntry | null {
  return BY_ID.get(id) ?? null
}

export const BLOCK_IDS: readonly BlockId[] = BLOCKS.map((block) => block.id)
