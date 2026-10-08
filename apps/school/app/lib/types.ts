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

export type CourseContents = {
  course: { id: string; title: string; slug: string; description: string | null }
  lessons: { id: string; title: string; order: number; viewed_at: string | null; has_quiz: boolean }[]
  progress: CourseProgress
  continue_lesson_id: string | null
}

export type LessonQuiz = {
  questions: { text: string; options: string[]; correct: number }[]
}

export type LessonContent = {
  id: string
  course_id: string
  title: string
  order: number
  body: string | null
  video_url: string | null
  quiz: LessonQuiz | null
  viewed_at: string | null
}
