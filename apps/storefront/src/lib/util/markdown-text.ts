import { parseMarkdown, type MarkdownInline } from "./markdown"

/**
 * The words of a markdown source without its markup (t-2026-10-08-13, part A5).
 *
 * A shop's content page and a journal article are markdown written in the tenant panel. When
 * the owner leaves `seo_description` empty, the description for search engines and social
 * cards is the beginning of that text — and a `<meta>` tag has no markdown reader behind it.
 * Measured on the legal pages of a live shop, 2026-10-08: «## Продавец **Индивидуальный
 * предприниматель …** | | | |---|---|» on the contacts page, «## 1. Общие положения и термины
 * 1.1.» on the offer, «**Дата редакции: 08.10.2026** --- ## 1.» on the policy and the consent.
 *
 * The text is read by the SAME parser the page is rendered with (`./markdown`), so the
 * description is the words a visitor reads, in reading order: a heading without its `#`, bold
 * and italic without their marks, a link as its label, a table as the text of its cells
 * without pipes and without the separator row, a list as its items; a `---` rule and a
 * picture give no words. Whitespace is collapsed to single spaces. Cutting to length at a word
 * boundary stays `metaDescription`'s job.
 *
 * `undefined` for an empty source, so a caller's `??` falls through to its next candidate.
 */
const words = (nodes: MarkdownInline[]): string =>
  nodes
    .filter((node) => node.type !== "image")
    .map((node) => node.value)
    .join("")

export function markdownText(source: string | null | undefined): string | undefined {
  if (!source) {
    return undefined
  }

  const parts: string[] = []

  for (const block of parseMarkdown(source)) {
    switch (block.type) {
      case "heading":
      case "paragraph":
        parts.push(words(block.content))
        break
      case "list":
        parts.push(...block.items.map(words))
        break
      case "quote":
        parts.push(...block.content.map(words))
        break
      case "table":
        for (const row of [block.header, ...block.rows]) {
          parts.push(...row.map(words))
        }
        break
      case "rule":
        break
    }
  }

  return parts.join(" ").replace(/\s+/g, " ").trim() || undefined
}
