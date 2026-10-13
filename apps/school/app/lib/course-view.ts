import type { CourseContents, CourseSection, LessonAttachment, LessonContent, LessonVideo } from "./types"
import { formatFileSize } from "./vendor/lesson-body"

/**
 * What the course and lesson pages say, apart from the markup: the sections,
 * the dates, the video and file captions. Plain functions, so the tests read
 * them without rendering a page.
 */

/**
 * The course's lessons by section. The API's own `sections` when it sends
 * them; otherwise the flat list folded the way the contract groups it:
 * lessons that follow each other in `order` with the same `section` are one
 * group. A course without sections is one group with no title.
 */
export function courseSections(contents: Pick<CourseContents, "lessons" | "sections">): CourseSection[] {
  if (contents.sections && contents.sections.length > 0) {
    return contents.sections
  }

  const sections: CourseSection[] = []

  for (const lesson of contents.lessons) {
    const title = lesson.section?.trim() || null
    const last = sections[sections.length - 1]

    if (last && last.title === title) {
      last.lessons.push(lesson)
    } else {
      sections.push({ title, order: sections.length, lessons: [lesson] })
    }
  }

  return sections
}

const MOSCOW = "Europe/Moscow"

/** «18 октября», or «18 октября 2027» when the year is not this one. */
export function dayMonth(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  const year = (value: Date) => new Intl.DateTimeFormat("ru-RU", { year: "numeric", timeZone: MOSCOW }).format(value)
  const sameYear = year(date) === year(now)

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: MOSCOW,
  })
    .format(date)
    .replace(/\s*г\.$/, "")
}

/** «Откроется 18 октября», or «Скоро откроется» when the API gave no date. */
export function opensText(opensAt: string | null | undefined, now?: Date): string {
  return opensAt ? `Откроется ${dayMonth(opensAt, now)}` : "Скоро откроется"
}

/** «Доступ до 19 января 2027». The year is always there: access runs past the new year. */
export function accessUntilText(iso: string): string {
  const date = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: MOSCOW })
    .format(new Date(iso))
    .replace(/\s*г\.$/, "")

  return `Доступ до ${date}`
}

/** «3:45», «1:43:12»; null for an unknown length. */
export function videoDuration(seconds: number | null | undefined): string | null {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) {
    return null
  }

  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, "0")

  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`
}

/** The line above a player: its title, or «Видео 2 из 3» when there are several, and its length. */
export function videoCaption(video: LessonVideo, index: number, total: number): string | null {
  const name = video.title?.trim() || (total > 1 ? `Видео ${index + 1} из ${total}` : null)
  const length = videoDuration(video.duration_sec)

  return [name, length].filter(Boolean).join(" · ") || null
}

/** The lesson's videos in order; a lesson from before `videos` has at most its one `video_url`. */
export function lessonVideos(lesson: Pick<LessonContent, "videos" | "video_url">): LessonVideo[] {
  if (lesson.videos && lesson.videos.length > 0) {
    return lesson.videos.filter((video) => Boolean(video.url))
  }

  return lesson.video_url ? [{ url: lesson.video_url }] : []
}

const MIME_EXT: Record<string, string> = {
  "application/pdf": "PDF",
  "application/zip": "ZIP",
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "audio/mpeg": "MP3",
}

/**
 * «Скачать «Подготовительный этап.pdf» — PDF, 1 МБ»: the words the text's
 * own file links use (`components/lesson-body.tsx`), with the size when the
 * API knows it.
 */
export function attachmentText(file: LessonAttachment): string {
  const ext = /\.([a-z0-9]{2,5})$/i.exec(file.name)?.[1]?.toUpperCase() ?? (file.mime ? MIME_EXT[file.mime] : undefined)
  const size = formatFileSize(file.size_bytes, "ru")
  const tail = [ext, size].filter(Boolean).join(", ")

  return tail ? `Скачать «${file.name}» — ${tail}` : `Скачать «${file.name}»`
}
