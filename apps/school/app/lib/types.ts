/**
 * The Store API's course answers as the school reads them. The shapes are the
 * backend's own (apps/backend/src/api/store/tenant/courses): `mine/route.ts`,
 * `mine/[slug]/route.ts` and `[id]/lessons/[lessonId]/route.ts`.
 */

export type CourseProgress = { completed: number; total: number; percent: number }

export type MyCourse = {
  id: string
  title: string
  slug: string
  product: { id: string; title: string; handle: string; thumbnail: string | null } | null
  /** False while the order for the course waits for payment. */
  access: boolean
  progress: CourseProgress | null
  continue_lesson_id: string | null
  /** The unpaid order the course waits on, when `access` is false. */
  order: { id: string; display_id: number | null } | null
}

/**
 * One lesson in the course's list. The fields after `has_quiz` came with the
 * course sections of t-2026-10-13-29 and are optional, so an older backend
 * that does not send them still reads: no section, no cover, never locked.
 */
export type CourseLessonRow = {
  id: string
  title: string
  order: number
  viewed_at: string | null
  has_quiz: boolean
  /** The section («Подготовка») the lesson sits in; lessons of one section follow each other in `order`. */
  section?: string | null
  cover_url?: string | null
  /** One line under the title in the list. */
  summary?: string | null
  /** A drip lesson whose day has not come: listed, but its page answers 403 `lesson_locked`. */
  locked?: boolean
  opens_at?: string | null
}

export type CourseSection = { title: string | null; order: number; lessons: CourseLessonRow[] }

export type CourseContents = {
  course: {
    id: string
    title: string
    slug: string
    description: string | null
    telegram_channel_url?: string | null
    telegram_chat_url?: string | null
    /** The end of the buyer's access, when the course has a limit. Nothing is revoked yet; the school only says it. */
    access_until?: string | null
  }
  /** The flat list, for readers of the API before sections. */
  lessons: CourseLessonRow[]
  sections?: CourseSection[]
  progress: CourseProgress
  continue_lesson_id: string | null
}

export type LessonQuiz = {
  questions: { text: string; options: string[]; correct: number }[]
}

/** A video of the lesson. `url` is the backend's media route, which checks the buyer's access. */
export type LessonVideo = { url: string; title?: string | null; duration_sec?: number | null; poster_url?: string | null }

export type LessonAttachment = { name: string; url: string; size_bytes?: number | null; mime?: string | null }

export type LessonLinkKind = "telegram_channel" | "telegram_chat" | "youtube" | "other"

export type LessonLink = { kind: LessonLinkKind; url: string; title: string }

export type LessonContent = {
  id: string
  course_id: string
  title: string
  order: number
  body: string | null
  /** The first video, for readers of the API before `videos`. */
  video_url: string | null
  videos?: LessonVideo[] | null
  attachments?: LessonAttachment[] | null
  links?: LessonLink[] | null
  quiz: LessonQuiz | null
  viewed_at: string | null
}

/** The lesson, or the date it opens when its day has not come (403 `lesson_locked`). */
export type LessonResult = { kind: "lesson"; lesson: LessonContent } | { kind: "locked"; opens_at: string | null }
