import { parseInline, type MarkdownInline } from "./markdown"

/**
 * A course lesson's text, typeset (ask-20261005-054319-4ad4, Ivan 05.10:
 * «Нужно привести в порядок типографику, убрать "голые" урлы с полным адресом
 * файлов и страниц в тексте»; rule 27i).
 *
 * The owner types a lesson into a plain text field of the panel, so the body
 * arrives as whatever came out of a document: `**bold**`, `- [ ]` checklists,
 * «—» and «•» pseudo-lists with blank lines between the items, numbered items
 * as paragraphs, `>` notes, and bare file and page addresses. This reads all
 * of that into blocks the lesson page renders as React elements:
 *
 * - a `#` line, and a line that is one `**…**` run, is a heading;
 * - lines starting with `-`, `*`, `+`, `•`, `—` or `–` are one bullet list,
 *   `[ ]`/`[x]` after the marker dropped (nobody can tick it); lines starting
 *   with `1.` or `2)` are one numbered list. Blank lines between the items of
 *   one list do not split it;
 * - two or more blank lines are one paragraph break, a single newline inside a
 *   paragraph stays a line break;
 * - a bare URL is never shown. It becomes a `file` (by its extension) or a
 *   `page` node, named by the words in front of it on the same line
 *   («Файл «Рецепты»: https://…/recipes.pdf» names the file «Рецепты»), or by
 *   the previous line when that line ends with a colon. The renderer words the
 *   link («Скачать «Рецепты» — PDF, 1,2 МБ», «Открыть cherkashino.ru»).
 *
 * Inline markup goes through `parseInline` of `./markdown`, the same reader
 * the content pages use, so no HTML is ever built from tenant text.
 */

export type LessonFileNode = {
  type: "file"
  href: string
  /** Upper-case extension, `PDF`. */
  ext: string
  /** What the file is, from «Файл «Рецепты»:» → `«Рецепты»`. */
  name: string | null
  /** The owner's own words for the link when they are not «Файл …». */
  label: string | null
}

export type LessonPageNode = {
  type: "page"
  href: string
  /** Host without `www.`, for «Открыть cherkashino.ru». */
  host: string
  label: string | null
}

export type LessonInline =
  | MarkdownInline
  | { type: "break" }
  | LessonFileNode
  | LessonPageNode

export type LessonBlock =
  | { type: "heading"; level: 2 | 3 | 4; content: LessonInline[] }
  | { type: "paragraph"; content: LessonInline[] }
  | { type: "list"; ordered: boolean; start: number; items: LessonInline[][] }
  | { type: "quote"; lines: LessonInline[][] }

export type LessonBodyOptions = {
  /** Origin a bare `/static/…` path is resolved against: the shop's API. */
  apiOrigin?: string | null
}

export const LESSON_FILE_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "zip",
  "jpg",
  "jpeg",
  "png",
  "mp3",
  "mp4",
]

const HEADING = /^(#{1,6})\s+(.*)$/
const STRONG_LINE = /^(?:\*\*([^*]+)\*\*|__([^_]+)__)$/
const CHECKBOX = /^\[[ xX]\]\s*/
const BULLET = /^[-*+•—–]\s+(.*)$/
// One to three digits: «2026. год» is a sentence, not item 2026.
const ORDERED = /^(\d{1,3})[.)]\s+(.*)$/
const QUOTE = /^>\s?(.*)$/
const RULE = /^(?:-{3,}|\*{3,}|_{3,})$/

// The patterns below that need a lookbehind or the `u`/`s` flags are built with
// the `RegExp` constructor: as literals they do not compile under this app's
// `es5` target (`tsconfig.json`), the same reason `./markdown` builds its own.
// A bare address: an absolute http(s) URL, or an upload path of the API
// (`/static/…`) standing on its own. Quotes and angle brackets end it.
const BARE_URL = new RegExp(
  '(?:https?:\\/\\/[^\\s<>"«»]+|(?<![^\\s(])\\/static\\/[^\\s<>"«»]+)',
  "g"
)
// Sentence punctuation typed right after an address is not part of it.
const URL_TAIL = /[.,;:!?…»"')\]]+$/
const URL_TAIL_IN_PARENS = /[.,;:!?…»"'\]]+$/
const LABEL_SEPARATORS = /[\s:\-—–]+$/
const FILE_PREFIX = /^(?:файлы?|file)(?=[\s«"“:]|$)\s*:?\s*/i
const HAS_WORD = new RegExp("\\p{L}{3,}", "u")
const MAX_LABEL_LENGTH = 120

type ListItem = { kind: "bullet" | "ordered"; number: number; text: string }

const listItem = (line: string): ListItem | null => {
  const ordered = ORDERED.exec(line)
  if (ordered) {
    return { kind: "ordered", number: Number(ordered[1]), text: ordered[2] }
  }
  const bullet = BULLET.exec(line)
  if (bullet) {
    return { kind: "bullet", number: 1, text: bullet[1].replace(CHECKBOX, "") }
  }
  if (CHECKBOX.test(line)) {
    return { kind: "bullet", number: 1, text: line.replace(CHECKBOX, "") }
  }
  return null
}

const extensionOf = (href: string): string | null => {
  try {
    const path = new URL(href, "http://x").pathname
    const match = /\.([a-z0-9]{2,5})$/i.exec(path)
    const ext = match?.[1].toLowerCase()
    return ext && LESSON_FILE_EXTENSIONS.includes(ext) ? ext.toUpperCase() : null
  } catch {
    return null
  }
}

const hostOf = (href: string): string => {
  try {
    return new URL(href).hostname.replace(/^www\./, "")
  } catch {
    return href
  }
}

/**
 * Where the last sentence of a text starts, the words in front of an address
 * naming it only from there: after the last `.`, `!`, `?` or `…` followed by a
 * space, a full stop inside «…» or “…” not counted, so «Файл «Дюбаж.
 * Инструкция по очищению печени»:» stays one name.
 */
const lastSentenceStart = (text: string): number => {
  let depth = 0
  let start = 0
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === "«" || char === "“") {
      depth++
    } else if ((char === "»" || char === "”") && depth > 0) {
      depth--
    } else if (depth === 0 && ".!?…".includes(char) && /\s/.test(text[index + 1] ?? "")) {
      start = index + 1
    }
  }
  return start
}

/**
 * Splits the text in front of an address into what stays text and the words
 * that name the address: the last sentence of it, separators trimmed, when it
 * has a real word and is not a whole paragraph.
 */
const carveLabel = (before: string): { rest: string; label: string | null } => {
  const trimmed = before.replace(LABEL_SEPARATORS, "")
  if (!trimmed.trim()) {
    return { rest: "", label: null }
  }
  const start = lastSentenceStart(trimmed)
  const gap = /^\s*/.exec(trimmed.slice(start))?.[0] ?? ""
  const head = trimmed.slice(0, start + gap.length)
  const tail = trimmed.slice(start + gap.length).trim()
  if (!HAS_WORD.test(tail) || tail.length > MAX_LABEL_LENGTH) {
    return { rest: before, label: null }
  }
  return { rest: head, label: tail }
}

const addressNode = (
  raw: string,
  label: string | null,
  options: LessonBodyOptions
): LessonFileNode | LessonPageNode => {
  let href = raw
  if (raw.startsWith("/") && options.apiOrigin) {
    try {
      href = new URL(raw, options.apiOrigin).toString()
    } catch {
      href = raw
    }
  }
  const ext = extensionOf(href)
  if (ext) {
    const prefixed = label ? FILE_PREFIX.exec(label) : null
    if (prefixed) {
      const name = label!.slice(prefixed[0].length).trim()
      return { type: "file", href, ext, name: name || null, label: null }
    }
    return { type: "file", href, ext, name: null, label }
  }
  return { type: "page", href, host: hostOf(href), label }
}

/** One text run with its bare addresses turned into file and page nodes. */
const linkifyText = (value: string, options: LessonBodyOptions): LessonInline[] => {
  const out: LessonInline[] = []
  let cursor = 0

  // `Array.from`, not `for…of` on the iterator: the `es5` target has no
  // downlevelIteration (`tsconfig.json`).
  for (const match of Array.from(value.matchAll(BARE_URL))) {
    const start = match.index ?? 0
    // A closing bracket stays when the address opened one itself (a wiki URL).
    const raw = match[0].replace(match[0].includes("(") ? URL_TAIL_IN_PARENS : URL_TAIL, "")
    if (!raw || raw === "/static/") {
      continue
    }
    const { rest, label } = carveLabel(value.slice(cursor, start))
    if (rest) {
      out.push({ type: "text", value: rest })
    }
    out.push(addressNode(raw, label, options))
    cursor = start + raw.length
  }

  const after = value.slice(cursor)
  if (after) {
    out.push({ type: "text", value: after })
  }
  return out
}

/**
 * One line of text as inline nodes: markup first, then the bare addresses in
 * what is left as text. A `**…**` run right before an address with nothing
 * else between them names it too («**Меню:** https://…/menu.pdf»). A stray
 * `**` with no partner is dropped rather than shown.
 */
const inlineLine = (line: string, options: LessonBodyOptions): LessonInline[] => {
  const out: LessonInline[] = []

  for (const node of parseInline(line)) {
    if (node.type !== "text") {
      out.push(node)
      continue
    }
    const nodes = linkifyText(node.value.replace(/\*\*/g, ""), options)
    const first = nodes[0]
    const previous = out[out.length - 1]
    if (
      first &&
      (first.type === "file" || first.type === "page") &&
      !first.label &&
      !(first.type === "file" && first.name) &&
      previous?.type === "strong"
    ) {
      out.pop()
      nodes[0] = addressNode(
        first.href,
        previous.value.replace(LABEL_SEPARATORS, "").trim() || null,
        options
      )
    }
    out.push(...nodes)
  }

  return trimEdges(out)
}

const trimEdges = (nodes: LessonInline[]): LessonInline[] => {
  const out = nodes.filter((node) => node.type !== "text" || node.value.length > 0)
  const first = out[0]
  if (first?.type === "text") {
    out[0] = { type: "text", value: first.value.trimStart() }
  }
  const last = out[out.length - 1]
  if (last?.type === "text") {
    out[out.length - 1] = { type: "text", value: last.value.trimEnd() }
  }
  return out.filter((node) => node.type !== "text" || node.value.length > 0)
}

const isUnnamedAddressLine = (nodes: LessonInline[]) =>
  nodes.length === 1 &&
  (nodes[0].type === "file" || nodes[0].type === "page") &&
  !nodes[0].label &&
  !(nodes[0].type === "file" && nodes[0].name)

/**
 * Lines of one paragraph or list item, each parsed, joined by line breaks.
 * An address alone on its line takes its name from the line above when that
 * line ends with a colon («Файл «Рецепты»:» then the address on the next one);
 * the line above is then folded into the link rather than shown twice.
 */
const inlineLines = (lines: string[], options: LessonBodyOptions): LessonInline[] => {
  const parsed: LessonInline[][] = []

  for (const line of lines) {
    const nodes = inlineLine(line, options)
    const above = parsed[parsed.length - 1]
    const aboveText =
      above?.length === 1 && above[0].type === "text" ? above[0].value : null
    if (isUnnamedAddressLine(nodes) && aboveText && /:\s*$/.test(aboveText)) {
      const { label } = carveLabel(aboveText)
      const node = nodes[0] as LessonFileNode | LessonPageNode
      if (label && label.length === aboveText.replace(LABEL_SEPARATORS, "").trim().length) {
        parsed.pop()
        parsed.push([addressNode(node.href, label, options)])
        continue
      }
    }
    parsed.push(nodes)
  }

  return parsed
    .filter((nodes) => nodes.length > 0)
    .flatMap((nodes, index) => (index === 0 ? nodes : [{ type: "break" as const }, ...nodes]))
}

/** The lesson body as blocks. Empty text, or text of blank lines, is no blocks. */
export function parseLessonBody(
  source: string | null | undefined,
  options: LessonBodyOptions = {}
): LessonBlock[] {
  const blocks: LessonBlock[] = []
  const lines = (source ?? "").replace(/\r\n?/g, "\n").split("\n")

  let paragraph: string[] = []
  let list: { kind: ListItem["kind"]; start: number; items: string[][] } | null = null
  let quote: string[] | null = null
  let blankBefore = false

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      const content = inlineLines(paragraph, options)
      if (content.length > 0) {
        blocks.push({ type: "paragraph", content })
      }
      paragraph = []
    }
  }

  const flushList = () => {
    if (list) {
      const items = list.items
        .map((item) => inlineLines(item, options))
        .filter((item) => item.length > 0)
      if (items.length > 0) {
        blocks.push({
          type: "list",
          ordered: list.kind === "ordered",
          start: list.start,
          items,
        })
      }
      list = null
    }
  }

  const flushQuote = () => {
    if (quote) {
      const quoted = quote
        .map((line) => {
          const item = listItem(line)
          return item ? item.text : line
        })
        .map((line) => inlineLine(line, options))
        .filter((nodes) => nodes.length > 0)
      if (quoted.length > 0) {
        blocks.push({ type: "quote", lines: quoted })
      }
      quote = null
    }
  }

  const flushAll = () => {
    flushParagraph()
    flushList()
    flushQuote()
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (line.length === 0) {
      flushParagraph()
      flushQuote()
      blankBefore = true
      continue
    }

    if (RULE.test(line)) {
      flushAll()
      blankBefore = true
      continue
    }

    const quoted = QUOTE.exec(line)
    if (quoted) {
      flushParagraph()
      flushList()
      quote ??= []
      const text = quoted[1].trim()
      if (text) {
        quote.push(text)
      }
      blankBefore = false
      continue
    }
    flushQuote()

    const heading = HEADING.exec(line)
    const strong = heading ? null : STRONG_LINE.exec(line)
    if (heading || strong) {
      flushParagraph()
      flushList()
      const level = heading
        ? ((Math.min(heading[1].length, 3) + 1) as 2 | 3 | 4)
        : 4
      const content = inlineLine(heading ? heading[2] : strong![1] ?? strong![2], options)
      if (content.length > 0) {
        blocks.push({ type: "heading", level, content })
      }
      blankBefore = false
      continue
    }

    const item = listItem(line)
    if (item) {
      flushParagraph()
      if (list && list.kind !== item.kind) {
        flushList()
      }
      if (!list) {
        list = { kind: item.kind, start: item.number, items: [] }
      }
      list.items.push([item.text])
      blankBefore = false
      continue
    }

    if (list) {
      if (blankBefore) {
        flushList()
      } else {
        // A line right under an item, with no blank line between, goes on
        // with that item: «1. Питание.» then its explanation on the next line.
        list.items[list.items.length - 1].push(line)
        continue
      }
    }

    paragraph.push(line)
    blankBefore = false
  }

  flushAll()

  return blocks
}

/** Every file a lesson links to, for the size lookup. */
export function lessonFileHrefs(blocks: LessonBlock[]): string[] {
  const hrefs = new Set<string>()
  const visit = (nodes: LessonInline[]) => {
    for (const node of nodes) {
      if (node.type === "file") {
        hrefs.add(node.href)
      }
    }
  }
  for (const block of blocks) {
    if (block.type === "list") {
      block.items.forEach(visit)
    } else if (block.type === "quote") {
      block.lines.forEach(visit)
    } else {
      visit(block.content)
    }
  }
  return Array.from(hrefs)
}

/**
 * A file size the way the shop's language writes it: «1,2 МБ», «340 КБ»,
 * `null` for an unknown or empty size, never «0 Б».
 */
export function formatFileSize(bytes: number | null | undefined, locale: string): string | null {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) {
    return null
  }
  const megabytes = bytes / (1024 * 1024)
  const [value, unit] =
    megabytes >= 1 ? [megabytes, "megabyte"] : [Math.max(bytes / 1024, 1), "kilobyte"]
  try {
    return new Intl.NumberFormat(locale, {
      style: "unit",
      unit,
      unitDisplay: "short",
      maximumFractionDigits: unit === "megabyte" ? 1 : 0,
    }).format(value)
  } catch {
    return null
  }
}
