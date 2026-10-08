import { useState } from "react"
import type { LessonQuiz as Quiz } from "~/lib/types"

/** How many answers are right. An unanswered question counts as wrong. */
export function scoreQuiz(quiz: Quiz, answers: (number | null)[]): number {
  return quiz.questions.filter((question, index) => answers[index] === question.correct).length
}

/**
 * The self-check after a lesson: up to three questions, the right answers come
 * with the lesson (`apps/backend/src/modules/course/quiz.ts`), so it is scored
 * here on the spot and nothing about an answer is stored.
 */
export function LessonQuiz({ quiz }: { quiz: Quiz }) {
  const [answers, setAnswers] = useState<(number | null)[]>(() => quiz.questions.map(() => null))
  const [checked, setChecked] = useState(false)
  const allAnswered = answers.every((answer) => answer !== null)
  const score = scoreQuiz(quiz, answers)

  const choose = (questionIndex: number, optionIndex: number) => {
    setAnswers((current) => current.map((answer, index) => (index === questionIndex ? optionIndex : answer)))
  }

  const reset = () => {
    setAnswers(quiz.questions.map(() => null))
    setChecked(false)
  }

  return (
    <section className="flex flex-col gap-y-5 rounded-theme bg-card p-4 shadow-card sm:p-6" data-testid="lesson-quiz">
      <div className="flex flex-col gap-y-1">
        <h2 className="text-xl font-semibold">Проверьте себя</h2>
        <p className="text-sm text-muted-foreground">Ответы никуда не отправляются, это проверка для вас.</p>
      </div>

      {quiz.questions.map((question, questionIndex) => (
        <fieldset key={questionIndex} className="flex flex-col gap-y-2">
          <legend className="mb-2 font-medium">
            {quiz.questions.length > 1 && `${questionIndex + 1}. `}
            {question.text}
          </legend>
          {question.options.map((option, optionIndex) => {
            const selected = answers[questionIndex] === optionIndex
            const isRight = optionIndex === question.correct
            const tone = !checked
              ? selected
                ? "border-primary bg-primary-tint"
                : "border-border hover:bg-muted"
              : isRight
                ? "border-success-border bg-success-bg"
                : selected
                  ? "border-destructive-border bg-destructive-bg"
                  : "border-border opacity-70"

            return (
              <label
                key={optionIndex}
                className={`flex min-h-11 cursor-pointer items-start gap-x-3 rounded-theme border px-3 py-2.5 ${tone}`}
              >
                <input
                  type="radio"
                  name={`question-${questionIndex}`}
                  className="mt-1 accent-[var(--primary)]"
                  checked={selected}
                  disabled={checked}
                  onChange={() => choose(questionIndex, optionIndex)}
                />
                <span>{option}</span>
                {checked && isRight && <span className="ms-auto text-sm text-success-text">Верно</span>}
              </label>
            )
          })}
        </fieldset>
      ))}

      {checked ? (
        <div className="flex flex-col gap-y-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-medium" role="status" data-testid="quiz-score">
            {score === quiz.questions.length
              ? "Все ответы верные"
              : `Верных ответов: ${score} из ${quiz.questions.length}`}
          </p>
          <button
            type="button"
            onClick={reset}
            className="h-11 rounded-theme border border-border px-4 text-sm font-medium hover:bg-muted"
          >
            Пройти ещё раз
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setChecked(true)}
          disabled={!allAnswered}
          className="h-11 rounded-theme bg-primary px-4 font-medium text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-fit"
        >
          Проверить ответы
        </button>
      )}
    </section>
  )
}
