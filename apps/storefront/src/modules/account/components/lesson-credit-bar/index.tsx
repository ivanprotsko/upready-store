"use client"

import { useTranslations } from "next-intl"
import { useLessonCredit } from "@modules/account/components/lesson-credit"
import LessonFlowBar from "@modules/account/components/lesson-flow-bar"

/**
 * The lesson page's bottom bar: «Дальше» stays off until the lesson counts,
 * with the reason next to it, and the strip moves the moment it does.
 */
export default function LessonCreditBar({
  back,
  next,
}: {
  back: { label: string; href: string }
  next: { label: string; href: string }
}) {
  const t = useTranslations("CourseBlock")
  const { credited, progress, rule } = useLessonCredit()

  return (
    <LessonFlowBar
      progress={progress}
      back={back}
      next={{
        label: next.label,
        href: next.href,
        disabled: !credited,
        hint: rule === "video" ? t("hintWatchVideo") : t("hintReadLesson"),
      }}
    />
  )
}
