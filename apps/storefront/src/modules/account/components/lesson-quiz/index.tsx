"use client"

import { useEffect, useRef, useState } from "react"
import { CheckCircleSolid, XCircleSolid } from "@medusajs/icons"
import { clx } from "@medusajs/ui"
import { useTranslations } from "next-intl"
import type { CourseProgress, LessonQuiz as LessonQuizContent } from "@lib/data/courses"
import LessonFlowBar from "@modules/account/components/lesson-flow-bar"

const OPTION =
  "flex w-full items-center gap-x-3 rounded-large border px-4 py-3 text-start text-base transition-colors"
// The tag text colours are the theme's success and destructive; the tag fills and borders follow
// its chart colours instead, which a neutral preset (supplements) paints grey.
const RIGHT =
  "border-status-success-text bg-status-success-bg text-status-success-text"
const WRONG =
  "border-status-error-text bg-status-error-bg text-status-error-text"

/**
 * The test after a lesson (ask-20261005-061005-2e78, Ivan 05.10: «После
 * каждого урока сделать "Тесты", в которых будет всего 3 шага по 1 вопросу с
 * вариантами ответов»). One question per step, «Вопрос 1 из 3». Picking an
 * option shows at once whether it was right and which option is, then
 * «Дальше» in the bottom bar moves on; after the last question the score,
 * «2 из 3», and «Дальше» leads to the next lesson. A self-check: a wrong
 * answer stops nothing, and nothing is sent anywhere.
 */
export default function LessonQuiz({
  quiz,
  progress,
  back,
  next,
}: {
  quiz: LessonQuizContent
  progress: CourseProgress
  back: { label: string; href: string }
  next: { label: string; href: string }
}) {
  const t = useTranslations("CourseBlock")
  const total = quiz.questions.length
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Array<number | null>>(() =>
    quiz.questions.map(() => null)
  )
  const headingRef = useRef<HTMLHeadingElement>(null)
  const moved = useRef(false)

  // After «Дальше», the next question or the score takes the focus, so a screen reader reads it.
  useEffect(() => {
    if (moved.current) {
      headingRef.current?.focus()
    }
  }, [step])

  const done = step >= total
  const question = quiz.questions[step]
  const answer = done ? null : answers[step]
  const score = quiz.questions.filter((row, index) => answers[index] === row.correct).length

  const choose = (option: number) => {
    if (answer !== null) {
      return
    }
    setAnswers((current) => current.map((value, index) => (index === step ? option : value)))
  }

  const goOn = () => {
    moved.current = true
    setStep((current) => current + 1)
  }

  return (
    <>
      <section
        className="flex flex-col gap-y-5 rounded-large border border-ui-border-base bg-ui-bg-base p-4 small:p-6"
        data-testid="lesson-quiz"
      >
        {done ? (
          <div className="flex flex-col gap-y-2" data-testid="lesson-quiz-result">
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="text-xl-semi text-ui-fg-base"
            >
              {t("testResult", { correct: score, total })}
            </h2>
          </div>
        ) : (
          <>
            <p className="text-sm text-ui-fg-muted" data-testid="lesson-quiz-step">
              {t("questionOf", { current: step + 1, total })}
            </p>
            <h2
              ref={headingRef}
              tabIndex={-1}
              id="lesson-quiz-question"
              className="text-large-semi text-ui-fg-base"
            >
              {question.text}
            </h2>
            <ul className="flex flex-col gap-y-2" aria-labelledby="lesson-quiz-question">
              {question.options.map((option, index) => {
                const chosen = answer === index
                const right = answer !== null && index === question.correct
                const wrong = chosen && index !== question.correct

                return (
                  <li key={`${step}-${index}`}>
                    <button
                      type="button"
                      aria-pressed={chosen}
                      disabled={answer !== null}
                      onClick={() => choose(index)}
                      className={clx(
                        OPTION,
                        answer === null &&
                          "border-ui-border-base text-ui-fg-base hover:bg-ui-bg-base-hover",
                        answer !== null &&
                          !right &&
                          !wrong &&
                          "border-ui-border-base text-ui-fg-subtle",
                        right && RIGHT,
                        wrong && WRONG
                      )}
                      data-testid="lesson-quiz-option"
                      data-state={right ? "right" : wrong ? "wrong" : undefined}
                    >
                      <span className="flex-1">{option}</span>
                      {right && <CheckCircleSolid className="flex-shrink-0" />}
                      {wrong && <XCircleSolid className="flex-shrink-0" />}
                    </button>
                  </li>
                )
              })}
            </ul>
            <p aria-live="polite" className="min-h-6 text-base" data-testid="lesson-quiz-feedback">
              {answer === null ? null : answer === question.correct ? (
                <span className="text-status-success-text">{t("answerCorrect")}</span>
              ) : (
                <span className="text-status-error-text">
                  {t("answerWrong", { answer: question.options[question.correct] })}
                </span>
              )}
            </p>
          </>
        )}
      </section>

      <LessonFlowBar
        progress={progress}
        back={back}
        next={
          done
            ? { label: next.label, href: next.href }
            : {
                label: t("stepNext"),
                onClick: goOn,
                disabled: answer === null,
                hint: t("hintChooseAnswer"),
              }
        }
      />
    </>
  )
}
