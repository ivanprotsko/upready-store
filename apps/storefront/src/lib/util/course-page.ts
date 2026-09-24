/**
 * The course product page's own content (t-2026-09-24-n23): the cover in
 * several widths, the description next to the buy box, and the sections under
 * it, all read from the store product.
 *
 * The backend fixture `apps/backend/scripts/fixtures/o26-seed-course-page-content.ts`
 * writes them: `metadata.cover` (`{ src, srcset: [{ w, url }], width, height, alt }`),
 * `metadata.course_page` (`{ about, faq, testimonials }`) and the description as
 * plain text. Metadata is free-form JSON an owner (or a later panel editor) can
 * write anything into, so every reader here checks the shape and drops what does
 * not fit rather than trusting a cast.
 */

export type CourseCover = {
  src: string
  srcset: { w: number; url: string }[]
  width: number
  height: number
  alt: string
}

export type CourseAboutSection = { heading: string; body: string }
export type CourseFaqItem = { q: string; a: string }
export type CourseTestimonial = {
  author: string
  text: string
  source: "image" | "text"
}

export type CoursePageContent = {
  about: CourseAboutSection[]
  faq: CourseFaqItem[]
  testimonials: CourseTestimonial[]
}

type Metadata = Record<string, unknown> | null | undefined

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

/** Only a web address or a site path may reach `src`/`srcset`. */
const SAFE_URL = /^(https?:\/\/|\/)/i

/** `metadata.cover`, or `null` when it is absent or malformed. */
export function readCourseCover(metadata: Metadata): CourseCover | null {
  const cover = metadata?.cover
  if (!isRecord(cover) || !nonEmpty(cover.src) || !SAFE_URL.test(cover.src)) {
    return null
  }

  const srcset = (Array.isArray(cover.srcset) ? cover.srcset : [])
    .filter(
      (entry): entry is { w: number; url: string } =>
        isRecord(entry) &&
        typeof entry.w === "number" &&
        entry.w > 0 &&
        nonEmpty(entry.url) &&
        SAFE_URL.test(entry.url)
    )
    .map(({ w, url }) => ({ w, url }))
    .sort((a, b) => a.w - b.w)

  const width =
    typeof cover.width === "number" && cover.width > 0 ? cover.width : 16
  const height =
    typeof cover.height === "number" && cover.height > 0 ? cover.height : 9

  return {
    src: cover.src,
    srcset,
    width,
    height,
    alt: typeof cover.alt === "string" ? cover.alt : "",
  }
}

/** The `srcset` attribute: `url 480w, url 768w, …`. Empty when there are no variants. */
export function coverSrcSet(cover: CourseCover): string {
  return cover.srcset.map(({ w, url }) => `${url} ${w}w`).join(", ")
}

/**
 * The cover's slot on the course page. From 1024 it is the content column: the
 * page minus its 24px side paddings, the 24rem buy box and the 24px gap between
 * them (456px in all), capped by the 1440 container at 984px. Below 1024 the
 * card spans the screen minus the 16px paddings. The browser picks the smallest
 * variant at least this wide × its pixel ratio, so a phone, a tablet and a
 * desktop each download a different file.
 */
export const COURSE_COVER_SIZES =
  "(min-width: 1440px) 984px, (min-width: 1024px) calc(100vw - 456px), calc(100vw - 32px)"

/** `metadata.course_page`, each list filtered to well-formed entries; `null` when nothing is left. */
export function readCoursePage(metadata: Metadata): CoursePageContent | null {
  const page = metadata?.course_page
  if (!isRecord(page)) {
    return null
  }

  const list = (value: unknown) => (Array.isArray(value) ? value : [])

  const about = list(page.about)
    .filter(
      (entry): entry is CourseAboutSection =>
        isRecord(entry) && nonEmpty(entry.heading) && nonEmpty(entry.body)
    )
    .map(({ heading, body }) => ({ heading, body }))
  const faq = list(page.faq)
    .filter(
      (entry): entry is CourseFaqItem =>
        isRecord(entry) && nonEmpty(entry.q) && nonEmpty(entry.a)
    )
    .map(({ q, a }) => ({ q, a }))
  const testimonials = list(page.testimonials)
    .filter(
      (entry): entry is CourseTestimonial =>
        isRecord(entry) && nonEmpty(entry.author) && nonEmpty(entry.text)
    )
    .map(({ author, text, source }) => ({
      author,
      text,
      source: source === "image" ? ("image" as const) : ("text" as const),
    }))

  if (!about.length && !faq.length && !testimonials.length) {
    return null
  }

  return { about, faq, testimonials }
}

export type CourseDescriptionBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; heading: string | null; items: string[] }
  | { type: "quote"; text: string; author: string | null }

const LIST_ITEM = /^\s*(?:[-*+•]|\d+[.)])\s+(.*)$/
const QUOTE_WITH_AUTHOR = /^(«.*»|".*"|“.*”)\s*(?:©|—|–|-)\s*(.+)$/

/**
 * Reads the course description (plain text, blocks separated by a blank line)
 * into the blocks the centre card shows. The text is Ivan's own, written the way
 * a landing is: a lead line, «ЭТОТ КУРС ДЛЯ ВАС, ЕСЛИ:» with its points, a quote
 * signed «© Оксана Черкашина», «Если чувствуешь:» and «Если видишь:» with theirs.
 *
 * - a block whose lines after the first are all list items (`- `, `• `, `* `,
 *   `1. `) is a list, and a first line ending in «:» is its heading;
 * - a one-line block in quotation marks followed by `©` or a dash and a name is a
 *   quote with its author;
 * - anything else is a paragraph, its line breaks kept.
 *
 * Deterministic and HTML-free: the result is rendered as React text nodes, so a
 * tag in the text stays literal. HTML an importer left in a description is
 * stripped by the caller (`stripHtml`) before it gets here.
 */
export function parseCourseDescription(text: string): CourseDescriptionBlock[] {
  const blocks: CourseDescriptionBlock[] = []
  const chunks = (text ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((chunk) =>
      chunk
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    )
    .filter((lines) => lines.length > 0)

  for (const lines of chunks) {
    const [first, ...rest] = lines
    const firstItem = LIST_ITEM.exec(first)
    const restItems = rest.map((line) => LIST_ITEM.exec(line))

    if (rest.length > 0 && restItems.every(Boolean)) {
      const items = restItems.map((match) => match![1].trim())
      if (firstItem) {
        blocks.push({
          type: "list",
          heading: null,
          items: [firstItem[1].trim(), ...items],
        })
      } else {
        blocks.push({ type: "list", heading: first, items })
      }
      continue
    }

    if (lines.length === 1 && firstItem) {
      blocks.push({ type: "list", heading: null, items: [firstItem[1].trim()] })
      continue
    }

    if (lines.length === 1) {
      const quote = QUOTE_WITH_AUTHOR.exec(first)
      if (quote) {
        blocks.push({
          type: "quote",
          text: quote[1].slice(1, -1).trim(),
          author: quote[2].trim(),
        })
        continue
      }
    }

    blocks.push({ type: "paragraph", text: lines.join("\n") })
  }

  return blocks
}
