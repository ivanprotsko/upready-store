import { getTranslations } from "next-intl/server"
import { Link } from "@i18n/navigation"
import type { MyCourse } from "@lib/data/courses"

/**
 * «Мои курсы» dashboard cards (o24-courses part (c)): one per live
 * entitlement, each with a progress bar and a CTA into the lesson player.
 * `product` is null only if the linked product was deleted after purchase —
 * the card still shows title and progress, just no CTA to click into.
 */
export default async function MyCoursesList({
  courses,
}: {
  courses: MyCourse[]
}) {
  const t = await getTranslations("CoursesPage")
  const tBlock = await getTranslations("CourseBlock")

  return (
    <ul className="flex flex-col gap-y-4 w-full" data-testid="my-courses-list">
      {courses.map((course) => {
        const ctaLabel =
          course.progress.percent === 100
            ? t("review")
            : course.progress.percent === 0
            ? t("start")
            : t("continue")

        return (
          <li
            key={course.id}
            className="border border-ui-border-base bg-ui-bg-base rounded-large p-6 flex flex-col gap-y-4"
            data-testid="my-course-card"
          >
            <div className="flex flex-col gap-y-3">
              <h2 className="text-lg font-medium text-ui-fg-base">
                {course.title}
              </h2>

              <div className="flex flex-col gap-y-1.5">
                <div className="h-2 w-full rounded-full bg-ui-bg-subtle overflow-hidden">
                  <div
                    className="h-full rounded-full bg-ui-tag-green-icon transition-[width] duration-300"
                    style={{ width: `${course.progress.percent}%` }}
                    aria-hidden="true"
                  />
                </div>
                <p className="text-sm text-ui-fg-subtle">
                  {tBlock("progress", {
                    completed: course.progress.completed,
                    total: course.progress.total,
                  })}
                </p>
              </div>
            </div>

            {course.product && (
              <Link
                href={`/products/${course.product.handle}`}
                className="inline-flex items-center self-start rounded-medium bg-ui-button-inverted px-4 py-2.5 text-sm font-medium text-ui-fg-on-color transition-colors hover:bg-ui-button-inverted-hover"
                data-testid="my-course-cta"
              >
                {ctaLabel}
              </Link>
            )}
          </li>
        )
      })}
    </ul>
  )
}
