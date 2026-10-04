import {
  courseContentsHref,
  courseLessonHref,
  courseLessonTestHref,
} from "@lib/util/course-links"

/**
 * The rules the lesson page runs on (ask-20261005-061005-2e78, Ivan 05.10:
 * «Мы будем защитывать просмотр, если человек досмотрел видео до конца, и
 * тогда будет активироваться кнопка "Далее"», and «После каждого урока
 * сделать "Тесты"»). Pure, so the page and its tests read the same answer.
 */

/** The share of a video that has to have actually played before its end counts. */
export const VIDEO_WATCHED_SHARE = 0.9

/** One range of `video.played`, start and end in seconds. */
export type PlayedRange = readonly [start: number, end: number]

/**
 * Seconds of the video that actually played: the union of the ranges, so a
 * stretch watched twice counts once and a skipped stretch not at all.
 */
export const playedSeconds = (ranges: readonly PlayedRange[]): number => {
  const sorted = ranges
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .map(([start, end]) => [Math.max(0, start), end] as const)
    .sort((a, b) => a[0] - b[0])

  let total = 0
  let runStart = 0
  let runEnd = -1

  for (const [start, end] of sorted) {
    if (start > runEnd) {
      if (runEnd > runStart) {
        total += runEnd - runStart
      }
      runStart = start
      runEnd = end
    } else {
      runEnd = Math.max(runEnd, end)
    }
  }
  if (runEnd > runStart) {
    total += runEnd - runStart
  }

  return total
}

/**
 * A video lesson counts once the video reached its end (`ended`) and at least
 * `VIDEO_WATCHED_SHARE` of its length actually played, so seeking to the end
 * does not count. A video that reports no finite length has only its end to
 * go by.
 */
export const isVideoWatched = ({
  ended,
  played,
  duration,
}: {
  ended: boolean
  played: readonly PlayedRange[]
  duration: number
}): boolean => {
  if (!ended) {
    return false
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    return true
  }

  return playedSeconds(played) >= duration * VIDEO_WATCHED_SHARE
}

/** A lesson as the steps of the course see it: where it is and whether a test follows it. */
export type FlowLesson = { id: string; has_quiz: boolean }

/** Where «Назад» or «Дальше» leads. */
export type FlowTarget =
  | { kind: "contents" }
  | { kind: "lesson"; lessonId: string }
  | { kind: "test"; lessonId: string }
  | { kind: "finish" }

/**
 * «Назад» and «Дальше» of one step. The course reads as lesson, its test if it
 * has one, next lesson, and so on: «Назад» from a lesson opens the test of the
 * lesson before it, else that lesson, and from the first lesson the course's
 * contents; «Дальше» from a lesson opens its own test, else the next lesson,
 * and from the last step finishes the course. A lesson the list does not have
 * sends both ways to the contents.
 */
export const lessonFlowTargets = (
  lessons: readonly FlowLesson[],
  current: { lessonId: string; test: boolean }
): { back: FlowTarget; next: FlowTarget } => {
  const steps: FlowTarget[] = lessons.flatMap((lesson): FlowTarget[] =>
    lesson.has_quiz
      ? [
          { kind: "lesson", lessonId: lesson.id },
          { kind: "test", lessonId: lesson.id },
        ]
      : [{ kind: "lesson", lessonId: lesson.id }]
  )
  const kind = current.test ? "test" : "lesson"
  const index = steps.findIndex(
    (step) => step.kind === kind && "lessonId" in step && step.lessonId === current.lessonId
  )

  if (index === -1) {
    return { back: { kind: "contents" }, next: { kind: "contents" } }
  }

  return {
    back: steps[index - 1] ?? { kind: "contents" },
    next: steps[index + 1] ?? { kind: "finish" },
  }
}

/** The address of a step, locale-less like every course link. Finishing leads to «Мои курсы». */
export const flowTargetHref = (slug: string, target: FlowTarget): string => {
  switch (target.kind) {
    case "contents":
      return courseContentsHref(slug)
    case "lesson":
      return courseLessonHref(slug, target.lessonId)
    case "test":
      return courseLessonTestHref(slug, target.lessonId)
    case "finish":
      return "/account/courses"
  }
}
