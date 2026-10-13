import { Form, Link, useLoaderData, useNavigation, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router"
import { LessonBody } from "~/components/lesson-body"
import { LessonAttachments, LessonLinks } from "~/components/lesson-extras"
import { LessonQuiz } from "~/components/lesson-quiz"
import { LessonVideos } from "~/components/lesson-videos"
import { ProgressBar } from "~/components/progress-bar"
import { LockIcon } from "~/components/telegram-buttons"
import { lessonVideos, opensText } from "~/lib/course-view"
import { lessonMediaUrl } from "~/lib/media"
import { getCourseContents, getLesson, markLessonViewed, requireSession } from "~/lib/store-api.server"
import type { CourseLessonRow, LessonContent } from "~/lib/types"
import { lessonHref } from "./app-course"

export function meta({ data }: { data?: { title: string; course: { title: string } } }) {
  return [{ title: data ? `${data.title} — ${data.course.title}` : "Мои курсы" }]
}

/**
 * One lesson: its videos, the text, its files and links, the test when the
 * lesson has one, and «Отметить пройденным»; or, for a lesson whose day has
 * not come (403 `lesson_locked`), the date it opens. The course's contents
 * come first, because the address carries the course's slug and the lesson
 * route wants its id; they also give the lesson's number and the lessons
 * before and after it. Every media address is made one the browser can load
 * here (`lessonMediaUrl`), so the page itself never sees the API's origin.
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const session = requireSession(request)
  const contents = await getCourseContents(session, params.slug ?? "")
  const result = await getLesson(session, contents.course.id, params.lessonId ?? "")
  const lessonId = result.kind === "lesson" ? result.lesson.id : (params.lessonId ?? "")
  const index = contents.lessons.findIndex((row) => row.id === lessonId)
  const row = index >= 0 ? contents.lessons[index] : undefined
  const media = (src: string | null | undefined) => lessonMediaUrl(src, session.config.apiBase, session.mediaOrigin)
  const step = (other: CourseLessonRow | undefined) =>
    other ? { id: other.id, title: other.title, locked: Boolean(other.locked), opens_at: other.opens_at ?? null } : null

  return {
    course: contents.course,
    progress: contents.progress,
    title: result.kind === "lesson" ? result.lesson.title : (row?.title ?? "Урок"),
    lesson: result.kind === "lesson" ? withMedia(result.lesson, media) : null,
    opensAt: result.kind === "locked" ? (result.opens_at ?? row?.opens_at ?? null) : null,
    number: index + 1,
    total: contents.lessons.length,
    previous: index > 0 ? step(contents.lessons[index - 1]) : null,
    next: index >= 0 ? step(contents.lessons[index + 1]) : null,
    apiOrigin: session.mediaOrigin,
  }
}

/** The lesson with its videos, posters and files at addresses the browser can load; one it cannot is left out. */
function withMedia(lesson: LessonContent, media: (src: string | null | undefined) => string | null) {
  return {
    ...lesson,
    videos: lessonVideos(lesson).flatMap((video) => {
      const url = media(video.url)

      return url ? [{ ...video, url, poster_url: media(video.poster_url) }] : []
    }),
    attachments: (lesson.attachments ?? []).flatMap((file) => {
      const url = media(file.url)

      return url ? [{ ...file, url }] : []
    }),
    links: (lesson.links ?? []).filter((link) => /^https?:\/\//i.test(link.url)),
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

function LockedLesson({ courseHref, opensAt }: { courseHref: string; opensAt: string | null }) {
  return (
    <section className="flex flex-col items-start gap-y-4 rounded-theme bg-muted p-6" data-testid="lesson-locked-page">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-muted-foreground">
        <LockIcon className="h-5 w-5" />
      </span>
      <div className="flex flex-col gap-y-1">
        <h2 className="text-lg font-semibold">{opensAt ? `Урок ${opensText(opensAt).toLowerCase()}` : "Урок скоро откроется"}</h2>
        <p className="max-w-measure text-muted-foreground">
          Уроки этого курса открываются по дням программы. Мы откроем этот урок в его день, заходите.
        </p>
      </div>
      <Link
        to={courseHref}
        className="inline-flex h-11 items-center rounded-theme border border-border bg-background px-4 font-medium hover:bg-muted"
        data-testid="locked-back"
      >
        ← к курсу
      </Link>
    </section>
  )
}

type Step = { id: string; title: string; locked: boolean; opens_at: string | null } | null

const STEP_CLASS = "flex min-h-11 flex-col justify-center rounded-theme border border-border px-3 py-2"

function LessonNav({ slug, previous, next }: { slug: string; previous: Step; next: Step }) {
  const courseHref = `/app/${encodeURIComponent(slug)}`

  return (
    <nav className="grid grid-cols-2 gap-3" aria-label="Уроки курса">
      {previous ? (
        <Link to={lessonHref(slug, previous.id)} className={`${STEP_CLASS} hover:bg-muted`}>
          <span className="text-xs text-muted-foreground">← Предыдущий</span>
          <span className="line-clamp-2 text-sm font-medium">{previous.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next && next.locked ? (
        // Not a link: the next lesson has nothing to show until its day.
        <div className={`${STEP_CLASS} items-end text-end`} data-testid="next-lesson-locked">
          <span className="text-xs text-muted-foreground">{`Следующий · ${opensText(next.opens_at).toLowerCase()}`}</span>
          <span className="line-clamp-2 text-sm font-medium text-muted-foreground">{next.title}</span>
        </div>
      ) : next ? (
        <Link to={lessonHref(slug, next.id)} className={`${STEP_CLASS} items-end text-end hover:bg-muted`} data-testid="next-lesson">
          <span className="text-xs text-muted-foreground">Следующий →</span>
          <span className="line-clamp-2 text-sm font-medium">{next.title}</span>
        </Link>
      ) : (
        <Link to={courseHref} className={`${STEP_CLASS} items-end text-end hover:bg-muted`}>
          <span className="text-xs text-muted-foreground">Это последний урок</span>
          <span className="text-sm font-medium">К оглавлению</span>
        </Link>
      )}
    </nav>
  )
}

export default function LessonPage() {
  const { course, progress, title, lesson, opensAt, number, total, previous, next, apiOrigin } =
    useLoaderData<typeof loader>()
  const navigation = useNavigation()
  const saving = navigation.state !== "idle" && navigation.formMethod?.toLowerCase() === "post"
  const done = Boolean(lesson?.viewed_at)
  const courseHref = `/app/${encodeURIComponent(course.slug)}`

  return (
    <article className="flex flex-col gap-y-6" data-testid="lesson-page">
      <div className="flex flex-col gap-y-2">
        <Link to={courseHref} className="w-fit text-sm text-muted-foreground hover:text-foreground" data-testid="back-to-contents">
          ← {course.title}
        </Link>
        {number > 0 && <p className="text-sm text-muted-foreground">{`Урок ${number} из ${total}`}</p>}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      </div>

      {lesson ? (
        <>
          <LessonVideos videos={lesson.videos} lessonId={lesson.id} />

          <LessonBody source={lesson.body} apiOrigin={apiOrigin} />

          <LessonAttachments files={lesson.attachments} />

          <LessonLinks links={lesson.links} />

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
        </>
      ) : (
        <LockedLesson courseHref={courseHref} opensAt={opensAt} />
      )}

      <LessonNav slug={course.slug} previous={previous} next={next} />
    </article>
  )
}
