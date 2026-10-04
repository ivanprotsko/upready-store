import { getTranslations } from "next-intl/server"
import { Link } from "@i18n/navigation"
import type { CourseProgress as CourseProgressSummary, MyCourse } from "@lib/data/courses"
import { continueCourseHref } from "@lib/util/course-links"
import CourseProgress from "@modules/products/components/course-progress"

/**
 * «Мои курсы» dashboard cards (o24-courses part (c)): one per live
 * entitlement, each with a progress bar and a CTA. The course lives in the
 * account (ask-20261005-053807-eaae), so the CTA never leads to the product
 * page: it opens the lesson `continue_lesson_id` names, or the course's
 * contents while no lesson is viewed (`continueCourseHref`). The page passes
 * only courses with access, which always carry a progress.
 */
export default async function MyCoursesList({
  courses,
}: {
  courses: (MyCourse & { progress: CourseProgressSummary })[]
}) {
  const t = await getTranslations("CoursesPage")

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

              <CourseProgress progress={course.progress} />
            </div>

            <Link
              href={continueCourseHref(course)}
              className="inline-flex items-center self-start rounded-medium bg-ui-button-inverted px-4 py-2.5 text-sm font-medium text-ui-fg-on-color transition-colors hover:bg-ui-button-inverted-hover"
              data-testid="my-course-cta"
            >
              {ctaLabel}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
