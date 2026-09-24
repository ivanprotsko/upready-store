import { LockClosedSolidMini, PlayMiniSolid } from "@medusajs/icons"
import { getTranslations } from "next-intl/server"
import { Link } from "@i18n/navigation"
import { getProductCourse } from "@lib/data/courses"

/**
 * The product page's course block (o24-courses part (c)): lesson list with
 * locks, and progress once bought. `getProductCourse` answers `null` for the
 * overwhelming majority of products (only two courses exist today), so this
 * renders nothing rather than an empty card — same rule the reviews block
 * and the characteristics block already follow (`ProductTemplate`'s own
 * `hasDetails` gate).
 */
export default async function CourseBlock({
  productId,
  productHandle,
}: {
  productId: string
  productHandle: string
}) {
  const data = await getProductCourse(productId)
  if (!data) return null

  const t = await getTranslations("CourseBlock")
  const { course, lessons, has_access, progress } = data

  return (
    <div
      className="content-container py-6 small:py-8"
      data-testid="course-block"
    >
      <div className="rounded-large border border-ui-border-base bg-ui-bg-base p-4 small:p-6 flex flex-col gap-y-5">
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
      </div>
    </div>
  )
}
