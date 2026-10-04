"use client"

import { useEffect, useRef } from "react"
import { LESSON_FLOW_BAR_CLEARANCE_PX } from "@modules/account/components/lesson-flow-bar"
import { useLessonCredit } from "@modules/account/components/lesson-credit"

/**
 * The end of a lesson's text (ask-20261005-061005-2e78, Р2): a lesson with no
 * video counts once this mark, placed after the text, shows above the bottom
 * controls. A text short enough to fit the screen counts as soon as it opens.
 * Inert for a video lesson, unless its video could not be played.
 */
export default function LessonReadMarker() {
  const { rule, credited, credit } = useLessonCredit()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = ref.current
    if (rule !== "read" || credited || !element) {
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          credit()
        }
      },
      { rootMargin: `0px 0px -${LESSON_FLOW_BAR_CLEARANCE_PX}px 0px` }
    )
    observer.observe(element)

    return () => observer.disconnect()
  }, [rule, credited, credit])

  return <div ref={ref} aria-hidden="true" className="h-px w-full" data-testid="lesson-end" />
}
