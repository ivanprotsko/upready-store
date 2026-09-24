"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircleSolid } from "@medusajs/icons"
import { useTranslations } from "next-intl"
import { Button } from "@medusajs/ui"
import { markLessonViewed } from "@lib/data/courses"

/**
 * «Отметить просмотренным» (o24-courses). Optimistic, then `router.refresh()`
 * so the course block's progress bar and «Мои курсы» pick up the new count —
 * both read the cart-less server route, not this component's own state.
 */
export default function LessonViewedButton({
  courseId,
  lessonId,
  initialViewed,
}: {
  courseId: string
  lessonId: string
  initialViewed: boolean
}) {
  const t = useTranslations("CourseBlock")
  const router = useRouter()
  const [viewed, setViewed] = useState(initialViewed)
  const [pending, startTransition] = useTransition()

  const markViewed = () => {
    setViewed(true)
    startTransition(async () => {
      const progress = await markLessonViewed(courseId, lessonId)
      if (!progress) {
        setViewed(initialViewed)
        return
      }
      router.refresh()
    })
  }

  if (viewed) {
    return (
      <Button variant="secondary" disabled data-testid="lesson-viewed-button">
        <CheckCircleSolid />
        {t("lessonViewed")}
      </Button>
    )
  }

  return (
    <Button
      variant="primary"
      isLoading={pending}
      onClick={markViewed}
      data-testid="lesson-viewed-button"
    >
      {t("markViewed")}
    </Button>
  )
}
