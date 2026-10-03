import { Fragment } from "react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { listProducts } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { getCountryCode } from "@lib/data/cookies"
import { decodeSegment } from "@lib/util/decode-segment"
import { getProductCourse, getCourseLesson } from "@lib/data/courses"
import { DEFAULT_REGION } from "@lib/util/env"
import { pageTitle } from "@lib/util/page-title"
import { getTranslations } from "next-intl/server"
import { Link } from "@i18n/navigation"
import LessonViewedButton from "@modules/products/components/lesson-viewed-button"

type Props = {
  params: Promise<{ handle: string; lessonId: string }>
}

/** A lesson body is plain text; its URLs (the course PDFs) become links. */
const BODY_URL = /(https?:\/\/[^\s]+)/

const resolveCourse = async (handle: string) => {
  const countryCode = (await getCountryCode()) ?? DEFAULT_REGION
  const region = await getRegion(countryCode)
  if (!region) return null

  const product = await listProducts({
    countryCode,
    queryParams: { handle: decodeSegment(handle) },
  }).then(({ response }) => response.products[0])
  if (!product?.id) return null

  const data = await getProductCourse(product.id)
  if (!data) return null

  return { product, data }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params
  const resolved = await resolveCourse(params.handle)
  const lesson = resolved?.data.lessons.find(
    (row) => row.id === params.lessonId
  )

  return {
    title: await pageTitle(lesson?.title ?? resolved?.data.course.title ?? ""),
  }
}

export default async function LessonPage(props: Props) {
  const params = await props.params
  const resolved = await resolveCourse(params.handle)
  if (!resolved) notFound()

  const { product, data } = resolved
  const { course, lessons, has_access, progress } = data
  const index = lessons.findIndex((row) => row.id === params.lessonId)
  if (index === -1) notFound()

  const lessonSummary = lessons[index]
  const prevLessonId = lessons[index - 1]?.id ?? null
  const nextLessonId = lessons[index + 1]?.id ?? null

  const t = await getTranslations("CourseBlock")
  const lessonHref = (id: string) => `/products/${product.handle}/lessons/${id}`

  const lesson = has_access
    ? await getCourseLesson(course.id, params.lessonId)
    : null

  return (
    <div className="content-container py-8 small:py-12">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Link
            href={`/products/${product.handle}`}
            className="text-sm text-ui-fg-subtle hover:text-ui-fg-base transition-colors"
          >
            {t("backToCourse")}
          </Link>
          <p className="text-sm text-ui-fg-muted">
            {course.title} · {t("lessonLabel", { order: lessonSummary.order })}
          </p>
          <h1 className="text-2xl font-semibold text-ui-fg-base small:text-3xl">
            {lessonSummary.title}
          </h1>
        </div>

        {progress && (
          <div
            className="flex flex-col gap-y-1.5"
            data-testid="course-block-progress"
          >
            <div className="h-2 w-full rounded-full bg-ui-bg-subtle overflow-hidden">
              <div
                className="h-full rounded-full bg-ui-tag-green-icon transition-[width] duration-300"
                style={{ width: `${progress.percent}%` }}
                aria-hidden="true"
              />
            </div>
            <p className="text-sm text-ui-fg-subtle">
              {t("progress", {
                completed: progress.completed,
                total: progress.total,
              })}
            </p>
          </div>
        )}

        {!has_access || !lesson ? (
          <div className="flex flex-col gap-2 rounded-large border border-ui-border-base bg-ui-bg-base p-6">
            <p className="text-base font-medium text-ui-fg-base">
              {t("locked")}
            </p>
            <p className="text-sm text-ui-fg-subtle">{t("lockedHint")}</p>
          </div>
        ) : (
          <>
            {lesson.video_url && (
              // eslint-disable-next-line jsx-a11y/media-has-caption -- no seeded lesson carries a caption track yet
              <video
                controls
                src={lesson.video_url}
                className="w-full rounded-large"
              />
            )}
            <p className="whitespace-pre-line text-ui-fg-base">
              {lesson.body.split(BODY_URL).map((part, index) =>
                // split() with a capturing group puts every URL at an odd index
                index % 2 === 1 ? (
                  <a
                    key={index}
                    href={part}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all underline hover:text-ui-fg-subtle"
                  >
                    {part}
                  </a>
                ) : (
                  <Fragment key={index}>{part}</Fragment>
                )
              )}
            </p>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-ui-border-base pt-6">
              <LessonViewedButton
                courseId={course.id}
                lessonId={lesson.id}
                initialViewed={Boolean(lesson.viewed_at)}
              />
              {nextLessonId ? (
                <Link
                  href={lessonHref(nextLessonId)}
                  className="inline-flex items-center rounded-medium border border-ui-border-base px-4 py-2.5 text-sm font-medium text-ui-fg-base transition-colors hover:bg-ui-bg-subtle"
                >
                  {t("next")}
                </Link>
              ) : (
                <Link
                  href="/account/courses"
                  className="inline-flex items-center rounded-medium border border-ui-border-base px-4 py-2.5 text-sm font-medium text-ui-fg-base transition-colors hover:bg-ui-bg-subtle"
                >
                  {t("finish")}
                </Link>
              )}
            </div>

            {prevLessonId && (
              <Link
                href={lessonHref(prevLessonId)}
                className="self-start text-sm text-ui-fg-subtle hover:text-ui-fg-base transition-colors"
              >
                {t("prev")}
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  )
}
