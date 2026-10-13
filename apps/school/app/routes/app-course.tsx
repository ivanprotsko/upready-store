import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router"
import { ProgressBar, lessonsWord } from "~/components/progress-bar"
import { LockIcon, TelegramButtons } from "~/components/telegram-buttons"
import { accessUntilText, courseSections, opensText } from "~/lib/course-view"
import { lessonMediaUrl } from "~/lib/media"
import { getCourseContents, requireSession } from "~/lib/store-api.server"
import type { CourseLessonRow } from "~/lib/types"

export function meta({ data }: { data?: { course: { title: string } } }) {
  return [{ title: data ? `${data.course.title} — Мои курсы` : "Мои курсы" }]
}

/**
 * One bought course: its lessons by section, which of them are done, which
 * are not open yet, and where to continue. The covers get the address the
 * browser can load here, on the server, where the API's origin is known.
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const session = requireSession(request)
  const contents = await getCourseContents(session, params.slug ?? "")
  const cover = (lesson: CourseLessonRow) => ({
    ...lesson,
    cover_url: lessonMediaUrl(lesson.cover_url, session.config.apiBase, session.mediaOrigin),
  })

  return {
    ...contents,
    lessons: contents.lessons.map(cover),
    sections: courseSections(contents).map((section) => ({ ...section, lessons: section.lessons.map(cover) })),
  }
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

function LessonRow({ lesson, number, slug }: { lesson: CourseLessonRow; number: number; slug: string }) {
  const done = Boolean(lesson.viewed_at)
  const locked = Boolean(lesson.locked)
  const content = (
    <>
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
          done ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground"
        }`}
        aria-hidden="true"
      >
        {locked ? <LockIcon /> : done ? "✓" : number}
      </span>
      {lesson.cover_url && (
        <img
          src={lesson.cover_url}
          alt=""
          loading="lazy"
          className="h-12 w-12 shrink-0 rounded-theme object-cover sm:h-14 sm:w-14"
          data-testid="lesson-cover"
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-y-0.5">
        <span className={`font-medium leading-snug ${locked ? "text-muted-foreground" : ""}`}>{lesson.title}</span>
        {lesson.summary && <span className="text-sm text-muted-foreground">{lesson.summary}</span>}
        <span className="text-sm text-muted-foreground">
          {locked ? (
            <span data-testid="lesson-opens">{opensText(lesson.opens_at)}</span>
          ) : (
            <>
              {done ? "Пройден" : "Не пройден"}
              {lesson.has_quiz ? " · есть тест" : ""}
            </>
          )}
        </span>
      </span>
    </>
  )
  const row = "flex min-h-14 items-center gap-x-3 px-4 py-3 sm:gap-x-4"

  return (
    <li>
      {locked ? (
        // Not a link: its page has nothing to show until the day comes.
        <div className={row} data-testid="lesson-locked" aria-label={`Урок ${number}: ${lesson.title}. ${opensText(lesson.opens_at)}`}>
          {content}
        </div>
      ) : (
        <Link to={lessonHref(slug, lesson.id)} className={`${row} hover:bg-muted`} data-testid="lesson-link">
          {content}
        </Link>
      )}
    </li>
  )
}

export default function CoursePage() {
  const { course, lessons, sections, progress, continue_lesson_id: continueId } = useLoaderData<typeof loader>()
  const startId = continueId ?? lessons.find((lesson) => !lesson.locked)?.id ?? null
  const started = progress.completed > 0
  const numbers = new Map(lessons.map((lesson, index) => [lesson.id, index + 1]))

  return (
    <div className="flex flex-col gap-y-6">
      <Link to="/app" className="w-fit text-sm text-muted-foreground hover:text-foreground">
        ← Мои курсы
      </Link>

      <header className="flex flex-col gap-y-4">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{course.title}</h1>
        <TelegramButtons channelUrl={course.telegram_channel_url} chatUrl={course.telegram_chat_url} />
        {course.description && <Description text={course.description} />}
        {course.access_until && (
          <p className="text-sm text-muted-foreground" data-testid="access-until">
            {accessUntilText(course.access_until)}
          </p>
        )}
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
        <div className="flex flex-col gap-y-8" data-testid="lesson-list">
          {sections.map((section, index) => (
            <section key={`${section.title ?? ""}-${index}`} className="flex flex-col gap-y-3" data-testid="lesson-section">
              {section.title && (
                <div className="flex items-baseline justify-between gap-x-4">
                  <h2 className="text-lg font-semibold tracking-tight">{section.title}</h2>
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {section.lessons.length} {lessonsWord(section.lessons.length)}
                  </span>
                </div>
              )}
              <ol className="flex flex-col divide-y divide-border rounded-theme bg-card shadow-card">
                {section.lessons.map((lesson) => (
                  <LessonRow key={lesson.id} lesson={lesson} number={numbers.get(lesson.id) ?? 0} slug={course.slug} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
