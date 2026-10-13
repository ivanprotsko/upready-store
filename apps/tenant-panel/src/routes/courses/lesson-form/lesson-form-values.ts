import type {
  CreateTenantLessonBody,
  TenantLesson,
  TenantLessonAttachment,
  TenantLessonLink,
  TenantLessonLinkKind,
  TenantLessonVideo,
} from "../../../hooks/api/courses"

// t-2026-10-13-29 stage 2: the lesson form's values and the body it sends,
// pulled out of the JSX so `src/__tests__/course-editor.test.mjs` can import
// and run them for real (this package renders no JSX in its tests). Every
// field of the form is a string while the owner types; this is where the
// strings become the contract's numbers, nulls and lists.

export type VideoRow = { url: string; title: string; duration_sec: number | null; poster_url: string | null }
export type AttachmentRow = { name: string; url: string; size_bytes: string; mime: string | null }
export type LinkRow = { kind: TenantLessonLinkKind; url: string; title: string }

export type LessonFormValues = {
  title: string
  body: string
  section: string
  summary: string
  cover_url: string
  available_from_day: string
  videos: VideoRow[]
  attachments: AttachmentRow[]
  links: LinkRow[]
}

export const LINK_KINDS: { value: TenantLessonLinkKind; label: string }[] = [
  { value: "telegram_channel", label: "Telegram-канал" },
  { value: "telegram_chat", label: "Telegram-чат" },
  { value: "youtube", label: "YouTube" },
  { value: "other", label: "Другая ссылка" },
]

export const emptyVideo = (): VideoRow => ({ url: "", title: "", duration_sec: null, poster_url: null })
export const emptyAttachment = (): AttachmentRow => ({ name: "", url: "", size_bytes: "", mime: null })
export const emptyLink = (): LinkRow => ({ kind: "telegram_channel", url: "", title: "" })

/** The form's values for a lesson, or for a new one. A lesson from before `videos` shows its `video_url` as the one video. */
export const fromLesson = (lesson?: TenantLesson): LessonFormValues => {
  const videos: TenantLessonVideo[] =
    lesson?.videos && lesson.videos.length > 0 ? lesson.videos : lesson?.video_url ? [{ url: lesson.video_url }] : []

  return {
    title: lesson?.title ?? "",
    body: lesson?.body ?? "",
    section: lesson?.section ?? "",
    summary: lesson?.summary ?? "",
    cover_url: lesson?.cover_url ?? "",
    available_from_day: lesson?.available_from_day ? String(lesson.available_from_day) : "",
    videos: videos.map((video) => ({
      url: video.url,
      title: video.title ?? "",
      duration_sec: video.duration_sec ?? null,
      poster_url: video.poster_url ?? null,
    })),
    attachments: (lesson?.attachments ?? []).map((file) => ({
      name: file.name,
      url: file.url,
      size_bytes: file.size_bytes ? String(file.size_bytes) : "",
      mime: file.mime ?? null,
    })),
    links: (lesson?.links ?? []).map((link) => ({ kind: link.kind, url: link.url, title: link.title })),
  }
}

/** One row moved up (`-1`) or down (`+1`); the list as it was at either end. */
export const moveRow = <T,>(rows: T[], index: number, delta: -1 | 1): T[] => {
  const target = index + delta
  if (index < 0 || index >= rows.length || target < 0 || target >= rows.length) {
    return rows
  }
  const next = rows.slice()
  const [row] = next.splice(index, 1)
  next.splice(target, 0, row as T)
  return next
}

/** The course's section names in the order they first appear, for the form's suggestions. */
export const sectionNames = (lessons: Pick<TenantLesson, "section" | "order">[]): string[] => {
  const names: string[] = []
  for (const lesson of [...lessons].sort((a, b) => a.order - b.order)) {
    const name = lesson.section?.trim()
    if (name && !names.includes(name)) {
      names.push(name)
    }
  }
  return names
}

/**
 * The section's place among the course's sections (the contract: the first
 * lesson of a group defines it), counted without the lesson being edited; a
 * new section goes after the last one.
 */
export const sectionOrderFor = (
  section: string | null,
  lessons: Pick<TenantLesson, "id" | "section" | "order">[],
  lessonId?: string
): number | null => {
  if (!section) {
    return null
  }
  const names = sectionNames(lessons.filter((lesson) => lesson.id !== lessonId))
  const index = names.indexOf(section)
  return index >= 0 ? index : names.length
}

/** The lessons as the school groups them: runs of one section, in `order`. A course without sections is one group with no title. */
export const lessonGroups = <TLesson extends Pick<TenantLesson, "section">>(
  lessons: TLesson[]
): { title: string | null; lessons: TLesson[] }[] => {
  const groups: { title: string | null; lessons: TLesson[] }[] = []
  for (const lesson of lessons) {
    const title = lesson.section?.trim() || null
    const last = groups[groups.length - 1]
    if (last && last.title === title) {
      last.lessons.push(lesson)
    } else {
      groups.push({ title, lessons: [lesson] })
    }
  }
  return groups
}

const WEB_URL = /^https?:\/\/\S+$/i

export type LessonSubmit =
  | { ok: true; body: Omit<CreateTenantLessonBody, "order"> }
  | { ok: false; error: string }

/**
 * The body the form sends, or the first thing the owner has to fix. A row
 * left completely empty is dropped, not refused: «Добавить видео» pressed
 * once too often should not block the save.
 */
export const toLessonBody = (
  values: LessonFormValues,
  lessons: Pick<TenantLesson, "id" | "section" | "order">[] = [],
  lessonId?: string
): LessonSubmit => {
  const title = values.title.trim()
  if (!title) {
    return { ok: false, error: "Укажите название урока." }
  }

  const coverUrl = values.cover_url.trim()
  if (coverUrl && !WEB_URL.test(coverUrl)) {
    return { ok: false, error: "Ссылка на обложку должна начинаться с http:// или https://" }
  }

  const dayText = values.available_from_day.trim()
  const day = dayText ? Number(dayText) : null
  if (day !== null && (!Number.isInteger(day) || day < 1)) {
    return { ok: false, error: "День открытия — целое число от 1, или оставьте поле пустым." }
  }

  const videos: TenantLessonVideo[] = []
  for (const [index, row] of values.videos.entries()) {
    const url = row.url.trim()
    const videoTitle = row.title.trim()
    if (!url && !videoTitle) continue
    if (!WEB_URL.test(url)) {
      return { ok: false, error: `Видео ${index + 1}: ссылка должна начинаться с http:// или https://` }
    }
    videos.push({
      url,
      ...(videoTitle ? { title: videoTitle } : {}),
      ...(row.duration_sec ? { duration_sec: row.duration_sec } : {}),
      ...(row.poster_url ? { poster_url: row.poster_url } : {}),
    })
  }

  const attachments: TenantLessonAttachment[] = []
  for (const [index, row] of values.attachments.entries()) {
    const name = row.name.trim()
    const url = row.url.trim()
    const sizeText = row.size_bytes.trim()
    if (!name && !url && !sizeText) continue
    if (!name) {
      return { ok: false, error: `Файл ${index + 1}: укажите имя файла.` }
    }
    if (!WEB_URL.test(url)) {
      return { ok: false, error: `Файл ${index + 1}: ссылка должна начинаться с http:// или https://` }
    }
    const size = sizeText ? Number(sizeText) : null
    if (size !== null && (!Number.isInteger(size) || size < 0)) {
      return { ok: false, error: `Файл ${index + 1}: размер — целое число байт.` }
    }
    attachments.push({ name, url, ...(size ? { size_bytes: size } : {}), ...(row.mime ? { mime: row.mime } : {}) })
  }

  const links: TenantLessonLink[] = []
  for (const [index, row] of values.links.entries()) {
    const url = row.url.trim()
    const linkTitle = row.title.trim()
    if (!url && !linkTitle) continue
    if (!WEB_URL.test(url)) {
      return { ok: false, error: `Ссылка ${index + 1}: адрес должен начинаться с http:// или https://` }
    }
    if (!linkTitle) {
      return { ok: false, error: `Ссылка ${index + 1}: укажите текст ссылки.` }
    }
    links.push({ kind: row.kind, url, title: linkTitle })
  }

  const section = values.section.trim() || null

  return {
    ok: true,
    body: {
      title,
      body: values.body,
      section,
      section_order: sectionOrderFor(section, lessons, lessonId),
      summary: values.summary.trim() || null,
      cover_url: coverUrl || null,
      available_from_day: day,
      videos,
      attachments,
      links,
      // The first video, for readers of the API before `videos`.
      video_url: videos[0]?.url ?? null,
    },
  }
}

/** «Доступ, дней» and «Старт потока» of the course form, as the API takes them. */
export const courseScheduleBody = (startDate: string, accessDays: string) => {
  const days = accessDays.trim() ? Number(accessDays.trim()) : null
  if (days !== null && (!Number.isInteger(days) || days < 1)) {
    return { ok: false as const, error: "Доступ, дней — целое число от 1, или оставьте поле пустым." }
  }
  const date = startDate.trim()
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false as const, error: "Старт потока — дата в формате ГГГГ-ММ-ДД." }
  }
  return {
    ok: true as const,
    // Midnight in Moscow, the school's time zone, so day 1 is the date the owner picked.
    start_date: date ? `${date}T00:00:00+03:00` : null,
    access_days: days,
  }
}

/** The `<input type="date">` value of a stored start, read in Moscow time. */
export const dateInputValue = (iso: string | null | undefined): string => {
  if (!iso) {
    return ""
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ""
  }
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(date)
}
