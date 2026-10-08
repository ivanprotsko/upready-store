import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router"
import { ProgressBar } from "~/components/progress-bar"
import { mediaUrl, publicApiOrigin } from "~/lib/media"
import { listMyCourses, requireSession } from "~/lib/store-api.server"
import type { MyCourse } from "~/lib/types"

export function meta() {
  return [{ title: "Мои курсы" }]
}

/** «Мои курсы»: every course the buyer holds, with its progress, and the ones whose order still waits for payment. */
export async function loader({ request }: LoaderFunctionArgs) {
  const session = requireSession(request)
  const courses = await listMyCourses(session)
  const apiOrigin = publicApiOrigin(session.config.apiBase)

  return {
    shopOrigin: session.config.shopOrigin,
    courses: courses.map((course) => ({ ...course, thumbnail: mediaUrl(course.product?.thumbnail, apiOrigin) })),
  }
}

type CourseCard = MyCourse & { thumbnail: string | null }

/** Where the card's button goes: the lesson to continue with, else the course's contents. */
export function courseHref(course: Pick<MyCourse, "slug" | "continue_lesson_id">): string {
  const base = `/app/${encodeURIComponent(course.slug)}`

  return course.continue_lesson_id ? `${base}/${encodeURIComponent(course.continue_lesson_id)}` : base
}

function actionLabel(course: MyCourse): string {
  const progress = course.progress

  if (!progress || progress.completed === 0) {
    return "Начать"
  }

  return progress.completed >= progress.total ? "Повторить" : "Продолжить"
}

function Cover({ src, title }: { src: string | null; title: string }) {
  return src ? (
    <img src={src} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-theme bg-muted object-cover" />
  ) : (
    <div
      aria-hidden="true"
      className="flex aspect-[4/3] w-full items-center justify-center rounded-theme bg-muted px-4 text-center text-lg font-semibold text-muted-foreground"
    >
      {title}
    </div>
  )
}

function OpenCourseCard({ course }: { course: CourseCard }) {
  return (
    <li className="flex flex-col gap-y-4 rounded-theme bg-card p-3 shadow-card sm:p-4" data-testid="course-card">
      <Link to={`/app/${encodeURIComponent(course.slug)}`} className="flex flex-col gap-y-3">
        <Cover src={course.thumbnail} title={course.title} />
        <h2 className="text-lg font-semibold leading-snug">{course.title}</h2>
      </Link>
      {course.progress && <ProgressBar progress={course.progress} />}
      <Link
        to={courseHref(course)}
        className="mt-auto flex h-11 items-center justify-center rounded-theme bg-primary px-4 font-medium text-primary-foreground hover:bg-primary-hover"
      >
        {actionLabel(course)}
      </Link>
    </li>
  )
}

function PendingCourseCard({ course, shopOrigin }: { course: CourseCard; shopOrigin: string }) {
  return (
    <li className="flex flex-col gap-y-4 rounded-theme bg-card p-3 shadow-card sm:p-4" data-testid="course-card-pending">
      <Cover src={course.thumbnail} title={course.title} />
      <div className="flex flex-col gap-y-2">
        <span className="w-fit rounded-full border border-warning-border bg-warning-bg px-2.5 py-0.5 text-xs font-medium text-warning-text">
          Ждёт оплаты
        </span>
        <h2 className="text-lg font-semibold leading-snug">{course.title}</h2>
        <p className="text-sm text-muted-foreground">
          Курс откроется, как только магазин получит оплату
          {course.order?.display_id ? ` заказа № ${course.order.display_id}` : ""}.
        </p>
      </div>
      {course.order && (
        <a
          href={`${shopOrigin}/account/orders/details/${encodeURIComponent(course.order.id)}`}
          className="mt-auto flex h-11 items-center justify-center rounded-theme border border-border px-4 font-medium hover:bg-muted"
        >
          Открыть заказ
        </a>
      )}
    </li>
  )
}

export default function MyCourses() {
  const { courses, shopOrigin } = useLoaderData<typeof loader>()

  return (
    <div className="flex flex-col gap-y-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Мои курсы</h1>

      {courses.length === 0 ? (
        <section
          className="flex flex-col items-start gap-y-3 rounded-theme bg-muted p-6 sm:p-8"
          data-testid="courses-empty"
        >
          <h2 className="text-lg font-semibold">Здесь пока нет курсов</h2>
          <p className="max-w-measure text-muted-foreground">
            Курс появится здесь сразу после оплаты в магазине. Если вы уже купили курс, проверьте, что вошли
            в тот же аккаунт, с которого оформляли заказ.
          </p>
          <a
            href={shopOrigin}
            className="mt-1 inline-flex h-11 items-center rounded-theme bg-primary px-4 font-medium text-primary-foreground hover:bg-primary-hover"
          >
            Перейти в магазин
          </a>
        </section>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {courses.map((course) =>
            course.access ? (
              <OpenCourseCard key={course.id} course={course} />
            ) : (
              <PendingCourseCard key={course.id} course={course} shopOrigin={shopOrigin} />
            ),
          )}
        </ul>
      )}
    </div>
  )
}
