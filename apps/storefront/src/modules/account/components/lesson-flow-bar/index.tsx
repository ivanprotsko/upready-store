"use client"

import { useId } from "react"
import { ChevronLeftMini, ChevronRightMini } from "@medusajs/icons"
import { clx } from "@medusajs/ui"
import { useTranslations } from "next-intl"
import { Link } from "@i18n/navigation"
import type { CourseProgress } from "@lib/data/courses"

/**
 * How far above the bottom edge the controls reach, in px: the page leaves
 * this much room under its content, and the end-of-text mark counts only once
 * it shows above it.
 */
export const LESSON_FLOW_BAR_CLEARANCE_PX = 88

export type LessonFlowNext = {
  label: string
  /** Where «Дальше» leads; without it «Дальше» is a button running `onClick`. */
  href?: string
  onClick?: () => void
  disabled?: boolean
  /** Why «Дальше» is off, shown next to it while it is. */
  hint?: string | null
}

const CONTROL =
  "pointer-events-auto inline-flex h-11 items-center gap-x-1 rounded-full px-4 text-sm font-medium transition-colors"
const BACK = clx(
  CONTROL,
  "bg-ui-bg-base text-ui-fg-base shadow-borders-base hover:bg-ui-bg-base-hover"
)
const NEXT = clx(
  CONTROL,
  "bg-ui-button-inverted text-ui-fg-on-color hover:bg-ui-button-inverted-hover",
  "disabled:cursor-not-allowed disabled:bg-ui-bg-disabled disabled:text-ui-fg-disabled"
)

/**
 * The course's steps at the bottom of a lesson and of its test
 * (ask-20261005-061005-2e78, Ivan 05.10: «прогресс прохождения курса нужно
 * сделать зеленой полоской прибитой к нижней границе экрана и тянущуюся на
 * всю ширину и высотой = 8, а справа и слева в углах сделать контролы "Назад"
 * и "Дальше"»). The strip is 8 px high across the whole width, filled to the
 * share of lessons counted, in the theme's success colour (`--success`,
 * bridged to `ui-tag-green-text` in styles/themes.css). «Назад» sits in the
 * start corner above it, «Дальше» in the end corner with the reason it is off.
 * The top right corner of the page stays free for the contents control.
 */
export default function LessonFlowBar({
  progress,
  back,
  next,
}: {
  progress: CourseProgress
  back: { label: string; href: string }
  next: LessonFlowNext
}) {
  const t = useTranslations("CourseBlock")
  const hintId = useId()
  const hint = next.disabled ? next.hint : null

  const nextContent = (
    <>
      {next.label}
      <ChevronRightMini className="rtl:rotate-180" />
    </>
  )

  return (
    <>
      <div
        aria-hidden="true"
        className="h-[calc(88px+env(safe-area-inset-bottom))]"
      />
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col"
        data-testid="lesson-flow-bar"
      >
        <nav
          aria-label={t("stepsLabel")}
          className="flex items-end justify-between gap-x-3 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] small:px-6"
        >
          <Link href={back.href} className={BACK} data-testid="lesson-flow-back">
            <ChevronLeftMini className="rtl:rotate-180" />
            {back.label}
          </Link>
          <div className="flex flex-col items-end gap-y-1.5 small:flex-row small:items-center small:gap-x-3">
            {hint && (
              <p
                id={hintId}
                className="pointer-events-auto rounded-full bg-ui-bg-base px-3 py-1 text-xs text-ui-fg-subtle shadow-borders-base"
                data-testid="lesson-flow-hint"
              >
                {hint}
              </p>
            )}
            {next.href && !next.disabled ? (
              <Link href={next.href} className={NEXT} data-testid="lesson-flow-next">
                {nextContent}
              </Link>
            ) : (
              <button
                type="button"
                className={NEXT}
                disabled={next.disabled}
                aria-describedby={hint ? hintId : undefined}
                onClick={next.onClick}
                data-testid="lesson-flow-next"
              >
                {nextContent}
              </button>
            )}
          </div>
        </nav>
        <div
          role="progressbar"
          aria-label={t("progressLabel")}
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.completed}
          aria-valuetext={t("progress", {
            completed: progress.completed,
            total: progress.total,
          })}
          className="h-2 w-full bg-ui-border-base"
          data-testid="lesson-flow-progress"
        >
          <div
            className="h-full bg-ui-tag-green-text transition-[width] duration-300"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      </div>
    </>
  )
}
