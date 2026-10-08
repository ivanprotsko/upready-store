import { Form, Link, useLoaderData, useNavigation, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router"
import { LessonBody } from "~/components/lesson-body"
import { LessonQuiz } from "~/components/lesson-quiz"
import { ProgressBar } from "~/components/progress-bar"
import { publicApiOrigin } from "~/lib/media"
import { getCourseContents, getLesson, markLessonViewed, requireSession } from "~/lib/store-api.server"
import { lessonHref } from "./app-course"

export function meta({ data }: { data?: { lesson: { title: string }; course: { title: string } } }) {
  return [{ title: data ? `${data.lesson.title} — ${data.course.title}` : "Мои курсы" }]
}

/**
 * One lesson: the video, the text, the test when the lesson has one, and
 * «Отметить пройденным». The course's contents come first, because the
 * address carries the course's slug and the lesson route wants its id; they
 * also give the lesson's number and the lessons before and after it.
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const session = requireSession(request)
  const contents = await getCourseContents(session, params.slug ?? "")
  const lesson = await getLesson(session, contents.course.id, params.lessonId ?? "")
  const index = contents.lessons.findIndex((row) => row.id === lesson.id)

  return {
    course: contents.course,
    progress: contents.progress,
    lesson,
    number: index + 1,
    total: contents.lessons.length,
    previous: index > 0 ? (contents.lessons[index - 1] ?? null) : null,
    next: index >= 0 ? (contents.lessons[index + 1] ?? null) : null,
    apiOrigin: publicApiOrigin(session.config.apiBase),
  }
}

/** «Отметить пройденным». The API keeps the first `viewed_at`, so a second press changes nothing. */
export async function action({ request, params }: ActionFunctionArgs) {
  const session = requireSession(request)
  const contents = await getCourseContents(session, params.slug ?? "")
  const progress = await markLessonViewed(session, contents.course.id, params.lessonId ?? "")

  return { progress }
}

const viewedDate = (iso: string) =>
  new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" }).format(new Date(iso))

export default function LessonPage() {
  const { course, progress, lesson, number, total, previous, next, apiOrigin } = useLoaderData<typeof loader>()
  const navigation = useNavigation()
  const saving = navigation.state !== "idle" && navigation.formMethod?.toLowerCase() === "post"
  const done = Boolean(lesson.viewed_at)

  return (
    <article className="flex flex-col gap-y-6" data-testid="lesson-page">
      <div className="flex flex-col gap-y-2">
        <Link
          to={`/app/${encodeURIComponent(course.slug)}`}
          className="w-fit text-sm text-muted-foreground hover:text-foreground"
          data-testid="back-to-contents"
        >
          ← {course.title}
        </Link>
        {number > 0 && (
          <p className="text-sm text-muted-foreground">{`Урок ${number} из ${total}`}</p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{lesson.title}</h1>
      </div>

      {lesson.video_url && (
        // No caption track: the shop's lessons carry none yet, the same as in the shop's account.
        <video
          controls
          playsInline
          preload="metadata"
          src={lesson.video_url}
          className="aspect-video w-full rounded-theme bg-foreground"
          data-testid="lesson-video"
        />
      )}

      <LessonBody source={lesson.body} apiOrigin={apiOrigin} />

      {lesson.quiz && <LessonQuiz key={lesson.id} quiz={lesson.quiz} />}

      <section className="flex flex-col gap-y-4 rounded-theme bg-muted p-4 sm:p-6">
        {done ? (
          <p className="font-medium text-success-text" data-testid="lesson-done">
            ✓ Урок пройден {lesson.viewed_at ? viewedDate(lesson.viewed_at) : ""}
          </p>
        ) : (
          <Form method="post">
            <button
              type="submit"
              disabled={saving}
              className="h-11 w-full rounded-theme bg-primary px-6 font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-60 sm:w-auto"
              data-testid="mark-viewed"
            >
              {saving ? "Сохраняем…" : "Отметить пройденным"}
            </button>
          </Form>
        )}
        <ProgressBar progress={progress} />
      </section>

      <nav className="grid grid-cols-2 gap-3" aria-label="Уроки курса">
        {previous ? (
          <Link
            to={lessonHref(course.slug, previous.id)}
            className="flex min-h-11 flex-col justify-center rounded-theme border border-border px-3 py-2 hover:bg-muted"
          >
            <span className="text-xs text-muted-foreground">← Предыдущий</span>
            <span className="line-clamp-2 text-sm font-medium">{previous.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            to={lessonHref(course.slug, next.id)}
            className="flex min-h-11 flex-col items-end justify-center rounded-theme border border-border px-3 py-2 text-end hover:bg-muted"
            data-testid="next-lesson"
          >
            <span className="text-xs text-muted-foreground">Следующий →</span>
            <span className="line-clamp-2 text-sm font-medium">{next.title}</span>
          </Link>
        ) : (
          <Link
            to={`/app/${encodeURIComponent(course.slug)}`}
            className="flex min-h-11 flex-col items-end justify-center rounded-theme border border-border px-3 py-2 text-end hover:bg-muted"
          >
            <span className="text-xs text-muted-foreground">Это последний урок</span>
            <span className="text-sm font-medium">К оглавлению</span>
          </Link>
        )}
      </nav>
    </article>
  )
}
