import { LockClosedSolidMini, PlayMiniSolid } from "@medusajs/icons"
import { getTranslations } from "next-intl/server"
import { Link } from "@i18n/navigation"
import type { ProductCourse } from "@lib/data/courses"

/**
 * The product page's course block (o24-courses part (c)): lesson list with
 * locks, and progress once bought. The template fetches the course once
 * (`getProductCourse`, `null` for the overwhelming majority of products) and
 * renders this only when there is one: the same answer also switches the page
 * to the course layout (t-2026-09-24-n23), where this card sits in the content
 * column between «О программе» and «Вопросы и ответы».
 */
export default async function CourseBlock({
  data,
  productHandle,
}: {
  data: ProductCourse
  productHandle: string
}) {
  const t = await getTranslations("CourseBlock")
  const { course, lessons, has_access, progress } = data

  return (
    <section
      id="course-programme"
      className="flex scroll-mt-24 flex-col gap-y-5 rounded-large border border-ui-border-base bg-ui-bg-base p-4 small:p-6"
      data-testid="course-block"
    >
      <div className="flex flex-col gap-y-1">
        <h2 className="text-xl font-semibold text-ui-fg-base">
          {t("heading")}
        </h2>
        {course.description && (
          <p className="text-ui-fg-subtle whitespace-pre-line">
            {course.description}
          </p>
        )}
      </div>

      {has_access && progress && (
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

      <ul
        className="flex flex-col divide-y divide-ui-border-base"
        data-testid="course-lesson-list"
      >
        {lessons.map((lesson) => {
          const content = (
            <>
              <span className="flex-shrink-0 text-ui-fg-muted">
                {lesson.locked ? <LockClosedSolidMini /> : <PlayMiniSolid />}
              </span>
              <span className="text-ui-fg-base">{lesson.title}</span>
            </>
          )

          return (
            <li key={lesson.id} data-testid="course-lesson-row">
              {lesson.locked ? (
                <div className="flex items-center gap-x-3 py-3 text-ui-fg-muted">
                  {content}
                </div>
              ) : (
                <Link
                  href={`/products/${productHandle}/lessons/${lesson.id}`}
                  className="flex items-center gap-x-3 py-3 hover:text-ui-fg-subtle transition-colors"
                >
                  {content}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
