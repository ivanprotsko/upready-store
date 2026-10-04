"use client"

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import { markLessonViewed, type CourseProgress } from "@lib/data/courses"

/** How this lesson counts as done: its video played to the end, or its text read to the end. */
export type LessonCreditRule = "video" | "read"

type LessonCreditState = {
  credited: boolean
  progress: CourseProgress
  rule: LessonCreditRule
  /** Counts the lesson: «Дальше» turns on at once and the backend is told. */
  credit: () => void
  /** The video cannot be played: the lesson counts by its text instead. */
  videoFailed: () => void
}

const LessonCreditContext = createContext<LessonCreditState | null>(null)

export const useLessonCredit = (): LessonCreditState => {
  const state = useContext(LessonCreditContext)
  if (!state) {
    throw new Error("useLessonCredit is used outside LessonCredit")
  }

  return state
}

/**
 * Whether the open lesson counts as done (ask-20261005-061005-2e78, Ivan
 * 05.10: «Мы будем защитывать просмотр, если человек досмотрел видео до
 * конца, и тогда будет активироваться кнопка "Далее"»). A lesson with a video
 * counts once `LessonVideo` saw it watched (`isVideoWatched`), one without a
 * video once `LessonReadMarker` came into view; a lesson counted before opens
 * counted. Counting enables «Дальше» right away, then posts to the viewed
 * route, the one «Мои курсы» and «Продолжить» read, and the bar takes the
 * fresh progress from its answer.
 */
export default function LessonCredit({
  courseId,
  lessonId,
  hasVideo,
  initialCredited,
  initialProgress,
  children,
}: {
  courseId: string
  lessonId: string
  hasVideo: boolean
  initialCredited: boolean
  initialProgress: CourseProgress
  children: React.ReactNode
}) {
  const [credited, setCredited] = useState(initialCredited)
  const [progress, setProgress] = useState(initialProgress)
  const [rule, setRule] = useState<LessonCreditRule>(hasVideo ? "video" : "read")
  const sent = useRef(initialCredited)

  const credit = useCallback(() => {
    if (sent.current) {
      return
    }
    sent.current = true
    setCredited(true)
    // One retry: a dropped request should not leave the lesson uncounted in «Мои курсы».
    void markLessonViewed(courseId, lessonId)
      .then((fresh) => fresh ?? markLessonViewed(courseId, lessonId))
      .then((fresh) => {
        if (fresh) {
          setProgress(fresh)
        }
      })
  }, [courseId, lessonId])

  const videoFailed = useCallback(() => setRule("read"), [])

  const state = useMemo(
    () => ({ credited, progress, rule, credit, videoFailed }),
    [credited, progress, rule, credit, videoFailed]
  )

  return <LessonCreditContext.Provider value={state}>{children}</LessonCreditContext.Provider>
}
