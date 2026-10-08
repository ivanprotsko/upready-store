import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router"
import { ProgressBar } from "~/components/progress-bar"
import { getCourseContents, requireSession } from "~/lib/store-api.server"
import type { CourseContents } from "~/lib/types"

export function meta({ data }: { data?: CourseContents }) {
  return [{ title: data ? `${data.course.title} — Мои курсы` : "Мои курсы" }]
}

/** One bought course: its lessons in order, which of them are done, and where to continue. */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const session = requireSession(request)

  return getCourseContents(session, params.slug ?? "")
}

export function lessonHref(slug: string, lessonId: string): string {
  return `/app/${encodeURIComponent(slug)}/${encodeURIComponent(lessonId)}`
}

function Description({ text }: { text: string }) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

  return (
    <div className="flex max-w-measure flex-col gap-y-3 text-muted-foreground">
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="whitespace-pre-line">
          {paragraph}
        </p>
      ))}
    </div>
  )
}

export default function CoursePage() {
  const { course, lessons, progress, continue_lesson_id: continueId } = useLoaderData<typeof loader>()
  const startId = continueId ?? lessons[0]?.id ?? null
  const started = progress.completed > 0

  return (
    <div className="flex flex-col gap-y-6">
      <Link to="/app" className="w-fit text-sm text-muted-foreground hover:text-foreground">
        ← Мои курсы
      </Link>

      <header className="flex flex-col gap-y-4">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{course.title}</h1>
        {course.description && <Description text={course.description} />}
        {lessons.length > 0 && (
          <div className="flex flex-col gap-y-4 sm:flex-row sm:items-end sm:justify-between sm:gap-x-8">
            <div className="w-full sm:max-w-sm">
              <ProgressBar progress={progress} />
            </div>
            {startId && (
              <Link
                to={lessonHref(course.slug, startId)}
                className="flex h-11 items-center justify-center rounded-theme bg-primary px-6 font-medium text-primary-foreground hover:bg-primary-hover"
                data-testid="continue-button"
              >
                {started ? "Продолжить" : "Начать курс"}
              </Link>
            )}
          </div>
        )}
      </header>

      {lessons.length === 0 ? (
        <section className="rounded-theme bg-muted p-6" data-testid="lessons-empty">
          <h2 className="text-lg font-semibold">Уроков пока нет</h2>
          <p className="mt-2 text-muted-foreground">Автор курса ещё готовит уроки. Загляните сюда позже.</p>
        </section>
      ) : (
        <ol className="flex flex-col divide-y divide-border rounded-theme bg-card shadow-card" data-testid="lesson-list">
          {lessons.map((lesson, index) => {
            const done = Boolean(lesson.viewed_at)

            return (
              <li key={lesson.id}>
                <Link
                  to={lessonHref(course.slug, lesson.id)}
                  className="flex min-h-14 items-center gap-x-3 px-4 py-3 hover:bg-muted sm:gap-x-4"
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
                      done ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground"
                    }`}
                    aria-hidden="true"
                  >
                    {done ? "✓" : index + 1}
                  </span>
                  <span className="flex flex-1 flex-col">
                    <span className="font-medium leading-snug">{lesson.title}</span>
                    <span className="text-sm text-muted-foreground">
                      {done ? "Пройден" : "Не пройден"}
                      {lesson.has_quiz ? " · есть тест" : ""}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
