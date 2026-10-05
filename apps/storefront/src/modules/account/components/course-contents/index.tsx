import { CheckCircleSolid, PlayMiniSolid } from "@medusajs/icons"
import { getTranslations } from "next-intl/server"
import { Link } from "@i18n/navigation"
import type { MyCourseContents } from "@lib/data/courses"
import { courseLessonHref } from "@lib/util/course-links"
import ChevronDown from "@modules/common/icons/chevron-down"
import CourseProgress from "@modules/products/components/course-progress"

/**
 * A bought course's contents in the account (ask-20261005-053807-eaae, Ivan
 * 05.10: «покупатель видит оглавление в кабинете а не на лендинге курса»):
 * the title, the progress, then every lesson in course order as a link to its
 * page in the account, a viewed one marked with a check and «Просмотрено».
 */
export default async function CourseContents({
  data,
}: {
  data: MyCourseContents
}) {
  const [t, tPage] = await Promise.all([
    getTranslations("CourseBlock"),
    getTranslations("CoursesPage"),
  ])
  const { course, lessons, progress } = data

  return (
    <div className="flex flex-col gap-y-6" data-testid="course-contents">
      <div className="flex flex-col gap-y-3">
        <Link
          href="/account/courses"
          className="flex w-fit items-center gap-x-1 txt-compact-small text-ui-fg-subtle hover:text-ui-fg-base"
          data-testid="back-to-my-courses"
        >
          <ChevronDown className="rotate-90 rtl:-rotate-90" size={16} />
          {tPage("backToCourses")}
        </Link>
        <h1 className="text-2xl-semi text-ui-fg-base">{course.title}</h1>
      </div>

      <CourseProgress progress={progress} data-testid="course-contents-progress" />

      <section className="flex flex-col gap-y-2 rounded-large border border-ui-border-base bg-ui-bg-base p-4 small:p-6">
        <h2 className="text-large-semi text-ui-fg-base">{t("contents")}</h2>
        <ul
          className="flex flex-col divide-y divide-ui-border-base"
          data-testid="course-contents-lessons"
        >
          {lessons.map((lesson) => {
            const viewed = Boolean(lesson.viewed_at)

            return (
              <li
                key={lesson.id}
                data-testid="course-contents-lesson"
                data-viewed={viewed}
              >
                <Link
                  href={courseLessonHref(course.slug, lesson.id)}
                  className="flex items-center gap-x-3 py-3 transition-colors hover:text-ui-fg-subtle"
                >
                  <span className="flex-shrink-0">
                    {viewed ? (
                      <CheckCircleSolid className="text-status-success" />
                    ) : (
                      <PlayMiniSolid className="text-ui-fg-muted" />
                    )}
                  </span>
                  <span className="flex-1 text-ui-fg-base">{lesson.title}</span>
                  {viewed && (
                    <span className="flex-shrink-0 text-sm text-ui-fg-subtle">
                      {t("lessonViewed")}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
