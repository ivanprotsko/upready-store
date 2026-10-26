import type { MarkdownBlock, MarkdownInline } from "@lib/util/markdown"

/**
 * The table of contents of a journal article (t-2026-10-05-03), after the «В этой статье»
 * rail of the chrxnasdmds journal: one entry per section heading, a sub-entry per
 * sub-heading.
 *
 * The article body is markdown. A `#` or `##` opens a section (a TOC entry, an `h2` on the
 * page), a `###` a sub-section (an indented entry, an `h3`). The anchors are computed from
 * the same block list the body renders (`MarkdownContent` with `variant="article"`), so the
 * TOC and the headings agree by construction.
 */

export type TocItem = { id: string; title: string; level: 2 | 3 }

/** The plain words of a run of inline nodes: a heading's text without its markup. */
export const inlineText = (nodes: MarkdownInline[]): string =>
  nodes.map((node) => node.value).join("").trim()

/** A run of anything but letters and digits, in any script (built at run time: the project targets ES5). */
const NOT_WORD = new RegExp("[^\\p{L}\\p{N}]+", "gu")

/**
 * A heading's anchor: its words in lower case, every run of other characters one hyphen.
 * Cyrillic and other scripts stay as they are, so a Russian heading gets a readable
 * `#что-такое-детокс` rather than a transliteration. A heading with no letter or digit at
 * all gets `section`.
 */
export const slugifyHeading = (text: string): string =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(NOT_WORD, "-")
    .replace(/^-+|-+$/g, "") || "section"

/**
 * The anchor of every heading block, by block index (`null` for a block that is not a
 * heading). Two headings with the same words get `-2`, `-3`… in order, so every anchor on
 * the page is unique.
 */
export const headingAnchors = (blocks: MarkdownBlock[]): (string | null)[] => {
  const seen = new Map<string, number>()
  return blocks.map((block) => {
    if (block.type !== "heading") return null
    const base = slugifyHeading(inlineText(block.content))
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base}-${n}`
  })
}

/** The level a heading block takes on the article page: `###` is a sub-section, the rest sections. */
export const articleHeadingLevel = (level: 1 | 2 | 3): 2 | 3 => (level === 3 ? 3 : 2)

/** The TOC entries of an article body, in reading order. */
export const buildToc = (blocks: MarkdownBlock[]): TocItem[] => {
  const anchors = headingAnchors(blocks)
  const items: TocItem[] = []
  blocks.forEach((block, index) => {
    const id = anchors[index]
    if (block.type !== "heading" || !id) return
    const title = inlineText(block.content)
    if (!title) return
    items.push({ id, title, level: articleHeadingLevel(block.level) })
  })
  return items
}
