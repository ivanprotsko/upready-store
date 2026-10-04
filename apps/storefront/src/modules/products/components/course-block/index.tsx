import { LockClosedSolidMini, PlayMiniSolid } from "@medusajs/icons"
import { getTranslations } from "next-intl/server"
import { Link } from "@i18n/navigation"
import type { ProductCourse } from "@lib/data/courses"
import { courseContentsHref, courseLessonHref } from "@lib/util/course-links"
import CourseProgress from "@modules/products/components/course-progress"

/**
 * The product page's course block (o24-courses part (c)): lesson list with
 * locks, and progress once bought. The template fetches the course once
 * (`getProductCourse`, `null` for the overwhelming majority of products) and
 * renders this only when there is one: the same answer also switches the page
 * to the course layout (t-2026-09-24-n23), where this card sits in the content
 * column between «О программе» and «Вопросы и ответы».
 *
 * The page stays the course's sales page; the course itself lives in the
 * account (ask-20261005-053807-eaae). For a buyer with access every lesson
 * links to its page there, and «Перейти к курсу» opens the course's contents.
 */
export default async function CourseBlock({ data }: { data: ProductCourse }) {
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
        <CourseProgress progress={progress} data-testid="course-block-progress" />
      )}

      {has_access && (
        <Link
          href={courseContentsHref(course.slug)}
          className="inline-flex items-center self-start rounded-medium bg-ui-button-inverted px-4 py-2.5 text-sm font-medium text-ui-fg-on-color transition-colors hover:bg-ui-button-inverted-hover"
          data-testid="course-block-go-to-course"
        >
          {t("goToCourse")}
        </Link>
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
                  href={courseLessonHref(course.slug, lesson.id)}
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
