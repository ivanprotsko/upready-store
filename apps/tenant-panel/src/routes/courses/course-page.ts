/**
 * The course page an owner edits on the course screen (t-2026-10-08-38): the
 * lists under the course's centre card on the storefront, kept in
 * `metadata.course_page` of the product the course sells on.
 *
 * The storefront reads them with `readCoursePage`
 * (`apps/storefront/src/lib/util/course-page.ts`): `about` [{ heading, body }],
 * `faq` [{ q, a }], `testimonials` [{ author, text, source }], and an entry
 * with an empty field is dropped there without a word. So the check here asks
 * for the same fields, and a list may be empty, the same as there.
 *
 * Only the base lists, in the shop's own language, are edited. The save keeps
 * every other key of `metadata` and of `course_page` (the cover, `i18n`) and
 * every key of an entry the form does not show, because the panel's product
 * write is the whole `metadata` object, the way `fill-course-page.ts` writes it.
 *
 * Plain TS, free of React, so `src/__tests__/course-page-editor.test.mjs`
 * imports and runs it as is, next to the storefront's own reader.
 *
 * t-2026-10-14-01 (G4): the course card reads the lists, and one entry at a
 * time is written: added or changed in its drawer, moved or deleted from its
 * «…». Each of those is the whole `metadata` again with that one change
 * (`putCoursePageEntry`, `moveCoursePageEntry`, `removeCoursePageEntry`).
 */

type Metadata = Record<string, unknown> | null | undefined

export type CourseAboutSection = { heading: string; body: string }
export type CourseFaqItem = { q: string; a: string }
export type CourseTestimonial = { author: string; text: string; source: "image" | "text" }

export type CoursePageLists = {
  about: CourseAboutSection[]
  faq: CourseFaqItem[]
  testimonials: CourseTestimonial[]
}

export type CoursePageList = keyof CoursePageLists

/**
 * One row of the form: the entry, the keys of it the form does not show
 * (`extra`, written back untouched), and an `id` the sortable list keeps the
 * row by while it moves. The `id` never reaches the product.
 */
type Row<T> = T & { id: string; extra: Record<string, unknown> }

export type CoursePageDraft = {
  about: Row<CourseAboutSection>[]
  faq: Row<CourseFaqItem>[]
  testimonials: Row<CourseTestimonial>[]
}

/** The fields an entry of each list must fill, in the order the form shows them. */
export const COURSE_PAGE_FIELDS = {
  about: ["heading", "body"],
  faq: ["q", "a"],
  testimonials: ["author", "text"],
} as const satisfies { [L in CoursePageList]: readonly (keyof CoursePageLists[L][number])[] }

export type CoursePageIssue = { list: CoursePageList; index: number; field: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const text = (value: unknown) => (typeof value === "string" ? value : "")

const entries = (value: unknown) =>
  (Array.isArray(value) ? value : []).filter(isRecord)

let lastId = 0

/** A row id unique within the page; the form never saves it. */
export const newRowId = () => `row_${++lastId}`

const omit = (entry: Record<string, unknown>, keys: readonly string[]) =>
  Object.fromEntries(Object.entries(entry).filter(([key]) => !keys.includes(key)))

const coursePageOf = (metadata: Metadata) =>
  isRecord(metadata?.course_page) ? metadata.course_page : {}

/**
 * The form's rows from the product's `metadata`. Every entry that is an object
 * becomes a row, an entry the storefront drops for an empty field included,
 * so the owner sees it and either fills it in or deletes it.
 */
export function readCoursePageDraft(metadata: Metadata): CoursePageDraft {
  const page = coursePageOf(metadata)

  return {
    about: entries(page.about).map((entry) => ({
      id: newRowId(),
      extra: omit(entry, ["heading", "body"]),
      heading: text(entry.heading),
      body: text(entry.body),
    })),
    faq: entries(page.faq).map((entry) => ({
      id: newRowId(),
      extra: omit(entry, ["q", "a"]),
      q: text(entry.q),
      a: text(entry.a),
    })),
    testimonials: entries(page.testimonials).map((entry) => ({
      id: newRowId(),
      extra: omit(entry, ["author", "text", "source"]),
      author: text(entry.author),
      text: text(entry.text),
      source: entry.source === "image" ? "image" : "text",
    })),
  }
}

/** A blank row for the «add» button of a list. */
export function emptyRow<L extends CoursePageList>(list: L): CoursePageDraft[L][number] {
  const base = { id: newRowId(), extra: {} }
  const rows = {
    about: { ...base, heading: "", body: "" },
    faq: { ...base, q: "", a: "" },
    testimonials: { ...base, author: "", text: "", source: "text" as const },
  }
  return rows[list] as CoursePageDraft[L][number]
}

/** The lists as the product stores them: fields trimmed, the form's `id` gone. */
export function coursePageLists(draft: CoursePageDraft): CoursePageLists {
  return {
    about: draft.about.map(({ extra, heading, body }) => ({
      ...extra,
      heading: heading.trim(),
      body: body.trim(),
    })),
    faq: draft.faq.map(({ extra, q, a }) => ({ ...extra, q: q.trim(), a: a.trim() })),
    testimonials: draft.testimonials.map(({ extra, author, text, source }) => ({
      ...extra,
      author: author.trim(),
      text: text.trim(),
      source,
    })),
  }
}

/**
 * Every field the storefront would drop its entry for: empty, or spaces only.
 * An empty list is not an issue: the storefront then shows no such section.
 */
export function coursePageIssues(draft: CoursePageDraft): CoursePageIssue[] {
  const issues: CoursePageIssue[] = []

  for (const list of Object.keys(COURSE_PAGE_FIELDS) as CoursePageList[]) {
    draft[list].forEach((row: Record<string, unknown>, index: number) => {
      for (const field of COURSE_PAGE_FIELDS[list]) {
        if (!text(row[field]).trim()) {
          issues.push({ list, index, field })
        }
      }
    })
  }

  return issues
}

/**
 * The product's whole `metadata` with the edited lists in `course_page`: every
 * other key of `metadata`, and of `course_page` (the cover, `i18n`), as it was.
 */
export function coursePageMetadata(
  metadata: Metadata,
  draft: CoursePageDraft
): Record<string, unknown> {
  const current = isRecord(metadata) ? metadata : {}

  return {
    ...current,
    course_page: { ...coursePageOf(current), ...coursePageLists(draft) },
  }
}

/** True when the form differs from what the product holds. */
export function coursePageChanged(metadata: Metadata, draft: CoursePageDraft): boolean {
  return (
    JSON.stringify(coursePageLists(readCoursePageDraft(metadata))) !==
    JSON.stringify(coursePageLists(draft))
  )
}

/**
 * The languages `course_page.i18n` carries a translation for. The form edits
 * the base lists only; the screen names these so the owner knows a buyer on
 * one of them reads the translation instead.
 */
export function coursePageTranslations(metadata: Metadata): string[] {
  const i18n = coursePageOf(metadata).i18n
  return isRecord(i18n) ? Object.keys(i18n).filter((locale) => isRecord(i18n[locale])) : []
}

/** The fields of one entry, keyed by the list's own field names (`COURSE_PAGE_FIELDS`). */
export type CoursePageEntryFields = Record<string, string>

/** What an entry's row reads: its heading, question or author, and its text. */
export const coursePageEntryText = (
  list: CoursePageList,
  entry: Record<string, unknown>
): { title: string; text: string } => {
  const [titleField, textField] = COURSE_PAGE_FIELDS[list]
  return { title: text(entry[titleField]), text: text(entry[textField]) }
}

/**
 * The whole `metadata` with one entry written: entry `index` of `list` takes
 * the fields, or a new entry goes last when `index` is null. Keys of the entry
 * the drawer does not show stay as they were.
 */
export function putCoursePageEntry(
  metadata: Metadata,
  list: CoursePageList,
  index: number | null,
  fields: CoursePageEntryFields
): Record<string, unknown> {
  const draft = readCoursePageDraft(metadata)
  const rows = draft[list] as Record<string, unknown>[]
  const picked = Object.fromEntries(COURSE_PAGE_FIELDS[list].map((field) => [field, fields[field] ?? ""]))

  if (index === null) {
    rows.push({ ...emptyRow(list), ...picked })
  } else if (rows[index]) {
    rows[index] = { ...rows[index], ...picked }
  }

  return coursePageMetadata(metadata, draft)
}

/** The whole `metadata` with entry `index` of `list` one place up or down; null at either end. */
export function moveCoursePageEntry(
  metadata: Metadata,
  list: CoursePageList,
  index: number,
  delta: -1 | 1
): Record<string, unknown> | null {
  const draft = readCoursePageDraft(metadata)
  const rows = draft[list] as unknown[]
  const target = index + delta
  if (index < 0 || index >= rows.length || target < 0 || target >= rows.length) {
    return null
  }
  const [row] = rows.splice(index, 1)
  rows.splice(target, 0, row)
  return coursePageMetadata(metadata, draft)
}

/** The whole `metadata` without entry `index` of `list`. */
export function removeCoursePageEntry(
  metadata: Metadata,
  list: CoursePageList,
  index: number
): Record<string, unknown> {
  const draft = readCoursePageDraft(metadata)
  ;(draft[list] as unknown[]).splice(index, 1)
  return coursePageMetadata(metadata, draft)
}

/** The lists the course card shows, in its order; a route's `:list` outside them is no list. */
export const COURSE_PAGE_LISTS = Object.keys(COURSE_PAGE_FIELDS) as CoursePageList[]

export const isCoursePageList = (value: string | undefined): value is CoursePageList =>
  COURSE_PAGE_LISTS.includes(value as CoursePageList)
