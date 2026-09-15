/**
 * The smallest markdown reader that covers what a shop owner writes into a
 * content page or a journal article from the tenant panel: headings,
 * paragraphs, bullet and numbered lists, blockquotes, thematic breaks, tables,
 * links, bold, italic and inline code.
 *
 * t10-blog added the rule and the quote. Measured over the 18 articles of the
 * shop this journal was built for (`select body from article where
 * status='published'`, source `medusa_chrxn`): 190 lines are a `---` rule and
 * 72 are `>` quote lines. Without these two block types both render as
 * literal text — a paragraph reading «---» and a quote keeping its «> »
 * prefix — on every article page.
 *
 * f07-page-markdown-tables added the table and the word-boundary rule on
 * underscore emphasis. The legal pages of this same tenant
 * (`contact.ru.md`) are GFM tables (`| ОГРНИП | {{ОГРНИП}} |` under a
 * `|---|---|` separator row); without a table block every row of every table
 * joins into one raw-text paragraph, pipes and all. Those same pages hold
 * tokens like `{{ЮР_АДРЕС}}`: an underscore emphasis rule with no word
 * boundary happily paired the underscore inside that token with an unrelated
 * one many words later (`{{ФИО_ИП}}`) and italicised everything in between —
 * CommonMark's own rule is that `_..._` does not fire intraword, only `__` at
 * a non-letter/non-digit boundary counts.
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
  | { type: "quote"; content: MarkdownInline[][] }
  | { type: "rule" }
  | { type: "table"; header: MarkdownInline[][]; rows: MarkdownInline[][][] }

/**
 * Only these four forms become links: an absolute http(s) URL, a `mailto:` or
 * `tel:` address (a Contacts page is mostly those two), and a site-internal
 * path. A `javascript:` or `data:` href is a script the visitor's browser would
 * run on a click, so such a link renders as its own label text instead — the
 * link is dropped, never the words.
 */
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/)/i

// The `_..._` and `__..__` forms only count as emphasis at a word boundary
// (CommonMark's intraword rule): a `_` right next to a letter or digit on its
// inner side cannot open or close one, so a token like `{{ЮР_АДРЕС}}` is left
// alone instead of pairing its underscore with an unrelated one elsewhere in
// the line. `\p{L}`/`\p{N}` cover non-Latin letters (Cyrillic included),
// unlike `\w` — the `u` flag they need only parses as a regex LITERAL under
// `--target es2015`+, so this one is built via the `RegExp` constructor to
// keep working under this app's `es5` target (`tsconfig.json`).
const INLINE_PATTERN = new RegExp(
  "(\\[[^\\]\\n]+\\]\\([^\\s)]+\\))" +
    "|(\\*\\*[^*\\n]+\\*\\*)" +
    "|(?<![\\p{L}\\p{N}])(__[^_\\n]+__)(?![\\p{L}\\p{N}])" +
    "|(\\*[^*\\n]+\\*)" +
    "|(?<![\\p{L}\\p{N}])(_[^_\\n]+_)(?![\\p{L}\\p{N}])" +
    "|(`[^`\\n]+`)",
  "u"
)

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

const HEADING = /^(#{1,6})\s+(.*)$/
const BULLET = /^[-*+]\s+(.*)$/
const ORDERED = /^\d+[.)]\s+(.*)$/
const QUOTE = /^>\s?(.*)$/
// Three or more of the same mark on a line of its own. Checked BEFORE the
// bullet pattern, or `---` reads as a bullet list item whose text is `--`.
const RULE = /^(?:-{3,}|\*{3,}|_{3,})$/
// A GFM table's own separator row: one or more `---`/`:-:`-shaped cells
// joined by `|`, optionally fenced by a leading/trailing pipe. Never matches
// a bare `---` (no pipe in it), so it cannot collide with RULE.
const TABLE_SEPARATOR = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/
// A candidate table row: contains at least one unescaped `|`. Whether it
// really is a table is decided by the line right after it (TABLE_SEPARATOR).
const TABLE_ROW = /\|/

/** Splits one table row into its raw (still unparsed) cell texts. */
function splitTableRow(line: string): string[] {
  let trimmed = line.trim()
  if (trimmed.startsWith("|")) {
    trimmed = trimmed.slice(1)
  }
  if (trimmed.endsWith("|")) {
    trimmed = trimmed.slice(0, -1)
  }
  return trimmed.split("|").map((cell) => cell.trim())
}

/**
 * Parses a whole document. Lines that belong together (consecutive non-blank
 * lines, consecutive list items) join into one block; a blank line ends the
 * block it follows. A heading deeper than `###` is read as `###`, because the
 * page renders its own `h1` from the title and a fourth level has nothing left
 * to be.
 *
 * A blockquote is one block per run of `>` lines, its own lines kept apart so
 * a quoted list of points does not collapse into one paragraph (the summary
 * box every article of the source journal opens with is exactly that shape).
 */
export function parseMarkdown(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = []
  const lines = (source ?? "").replace(/\r\n?/g, "\n").split("\n")

  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let quote: string[] | null = null

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", content: parseInline(paragraph.join(" ")) })
      paragraph = []
    }
  }

  const flushQuote = () => {
    if (quote) {
      // A quoted bullet (`> - point`) keeps its dash after the `>` is gone.
      // Each quoted line already renders as its own paragraph, which is what
      // the dash was there to say, so the marker itself is dropped rather than
      // left on the page as literal text.
      const lines = quote
        .map((line) => line.replace(/^[-*+]\s+/, ""))
        .filter((line) => line.length > 0)
      if (lines.length > 0) {
        blocks.push({ type: "quote", content: lines.map((line) => parseInline(line)) })
      }
      quote = null
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (line.length === 0) {
      flushParagraph()
      flushList()
      flushQuote()
      continue
    }

    if (RULE.test(line)) {
      flushParagraph()
      flushList()
      flushQuote()
      blocks.push({ type: "rule" })
      continue
    }

    // A table is recognised by its SECOND line, the separator row, so this
    // line only commits to being a header once that lookahead confirms it —
    // a plain paragraph line that happens to contain `|` (a shop owner typing
    // "цена | 500 ₽" as prose) is not enough on its own.
    if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1].trim())) {
      flushParagraph()
      flushList()
      flushQuote()

      const header = splitTableRow(line)
      const rows: string[][] = []
      let cursor = i + 2

      while (cursor < lines.length && TABLE_ROW.test(lines[cursor].trim())) {
        rows.push(splitTableRow(lines[cursor]))
        cursor += 1
      }

      blocks.push({
        type: "table",
        header: header.map((cell) => parseInline(cell)),
        rows: rows.map((row) => row.map((cell) => parseInline(cell))),
      })

      i = cursor - 1
      continue
    }

    const quoted = QUOTE.exec(line)
    if (quoted) {
      flushParagraph()
      flushList()
      quote ??= []
      quote.push(quoted[1].trim())
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      flushParagraph()
      flushList()
      flushQuote()
      blocks.push({
        type: "heading",
        level: Math.min(heading[1].length, 3) as 1 | 2 | 3,
        content: parseInline(heading[2]),
      })
      continue
    }

    const bullet = BULLET.exec(line)
    const ordered = ORDERED.exec(line)

    if (bullet || ordered) {
      flushParagraph()
      flushQuote()
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
    flushQuote()
    paragraph.push(line)
  }

  flushParagraph()
  flushList()
  flushQuote()

  return blocks
}
