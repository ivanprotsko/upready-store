/**
 * The smallest markdown reader that covers what a shop owner writes into a
 * content page from the tenant panel: headings, paragraphs, bullet and numbered
 * lists, links, bold, italic and inline code.
 *
 * It returns a block list, not an HTML string, on purpose. The text comes from a
 * tenant, so it is untrusted; a renderer that builds HTML would need escaping
 * and `dangerouslySetInnerHTML`, and one missed escape is a stored XSS on every
 * visitor of that storefront. Blocks are rendered as React elements instead
 * (`@modules/content/components/markdown-content`), where the text nodes are
 * escaped by React itself and there is no HTML to sanitise. Raw HTML in the
 * source is therefore not markup at all: it stays literal text on the page.
 *
 * `package.json` carries no markdown dependency and this piece adds none
 * (`docs/tenant-panel/api-contract.md`, "Piece 7").
 */

export type MarkdownInline =
  | { type: "text"; value: string }
  | { type: "strong"; value: string }
  | { type: "em"; value: string }
  | { type: "code"; value: string }
  | { type: "link"; value: string; href: string }

export type MarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3; content: MarkdownInline[] }
  | { type: "paragraph"; content: MarkdownInline[] }
  | { type: "list"; ordered: boolean; items: MarkdownInline[][] }

/**
 * Only these four forms become links: an absolute http(s) URL, a `mailto:` or
 * `tel:` address (a Contacts page is mostly those two), and a site-internal
 * path. A `javascript:` or `data:` href is a script the visitor's browser would
 * run on a click, so such a link renders as its own label text instead — the
 * link is dropped, never the words.
 */
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/)/i

const INLINE_PATTERN =
  /(\[[^\]\n]+\]\([^\s)]+\))|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)|(`[^`\n]+`)/

/** Splits one line of source into text, links, bold, italic and code runs. */
export function parseInline(source: string): MarkdownInline[] {
  const out: MarkdownInline[] = []
  let rest = source

  while (rest.length > 0) {
    const match = INLINE_PATTERN.exec(rest)

    if (!match || match.index === undefined) {
      out.push({ type: "text", value: rest })
      break
    }

    if (match.index > 0) {
      out.push({ type: "text", value: rest.slice(0, match.index) })
    }

    const token = match[0]

    if (token.startsWith("[")) {
      const split = token.indexOf("](")
      const label = token.slice(1, split)
      const href = token.slice(split + 2, -1)

      out.push(
        SAFE_HREF.test(href)
          ? { type: "link", value: label, href }
          : { type: "text", value: label }
      )
    } else if (token.startsWith("**") || token.startsWith("__")) {
      out.push({ type: "strong", value: token.slice(2, -2) })
    } else if (token.startsWith("`")) {
      out.push({ type: "code", value: token.slice(1, -1) })
    } else {
      out.push({ type: "em", value: token.slice(1, -1) })
    }

    rest = rest.slice(match.index + token.length)
  }

  return out.filter((node) => node.type !== "text" || node.value.length > 0)
}

const HEADING = /^(#{1,3})\s+(.*)$/
const BULLET = /^[-*+]\s+(.*)$/
const ORDERED = /^\d+[.)]\s+(.*)$/

/**
 * Parses a whole document. Lines that belong together (consecutive non-blank
 * lines, consecutive list items) join into one block; a blank line ends the
 * block it follows. A heading deeper than `###` is read as `###`, because the
 * page renders its own `h1` from the title and a fourth level has nothing left
 * to be.
 */
export function parseMarkdown(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = []
  const lines = (source ?? "").replace(/\r\n?/g, "\n").split("\n")

  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", content: parseInline(paragraph.join(" ")) })
      paragraph = []
    }
  }

  const flushList = () => {
    if (list) {
      blocks.push({
        type: "list",
        ordered: list.ordered,
        items: list.items.map((item) => parseInline(item)),
      })
      list = null
    }
  }

  for (const raw of lines) {
    const line = raw.trim()

    if (line.length === 0) {
      flushParagraph()
      flushList()
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      flushParagraph()
      flushList()
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        content: parseInline(heading[2]),
      })
      continue
    }

    const bullet = BULLET.exec(line)
    const ordered = ORDERED.exec(line)

    if (bullet || ordered) {
      flushParagraph()
      const isOrdered = Boolean(ordered)
      const text = (bullet ? bullet[1] : ordered![1]).trim()

      if (list && list.ordered !== isOrdered) {
        flushList()
      }

      if (!list) {
        list = { ordered: isOrdered, items: [] }
      }

      list.items.push(text)
      continue
    }

    flushList()
    paragraph.push(line)
  }

  flushParagraph()
  flushList()

  return blocks
}
