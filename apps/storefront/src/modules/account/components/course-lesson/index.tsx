import { getTranslations } from "next-intl/server"
import { Link } from "@i18n/navigation"
import type { CourseLesson as CourseLessonContent, MyCourseContents } from "@lib/data/courses"
import { courseContentsHref, courseLessonHref } from "@lib/util/course-links"
import LessonBody from "@modules/account/components/lesson-body"
import ChevronDown from "@modules/common/icons/chevron-down"
import CourseProgress from "@modules/products/components/course-progress"
import LessonViewedButton from "@modules/products/components/lesson-viewed-button"

/**
 * One lesson of a bought course, in the account (ask-20261005-053807-eaae):
 * the video, the text (typeset by `LessonBody`, ask-20261005-054319-4ad4),
 * «Отметить просмотренным», the previous and the next lesson, and the way
 * back to the course's contents. `data` is the course's
 * contents (`getMyCourse`), which give the lesson order and the progress;
 * `lesson` is the player route's answer with the body and the video.
 */
export default async function CourseLesson({
  data,
  lesson,
}: {
  data: MyCourseContents
  lesson: CourseLessonContent
}) {
  const t = await getTranslations("CourseBlock")
  const { course, lessons, progress } = data
  const index = lessons.findIndex((row) => row.id === lesson.id)
  const prevLessonId = lessons[index - 1]?.id ?? null
  const nextLessonId = lessons[index + 1]?.id ?? null

  return (
    <div className="flex flex-col gap-y-6" data-testid="course-lesson">
      <div className="flex flex-col gap-y-3">
        <Link
          href={courseContentsHref(course.slug)}
          className="flex w-fit items-center gap-x-1 txt-compact-small text-ui-fg-subtle hover:text-ui-fg-base"
          data-testid="back-to-course-contents"
        >
          <ChevronDown className="rotate-90 rtl:-rotate-90" size={16} />
          {t("backToContents")}
        </Link>
        <p className="text-sm text-ui-fg-muted">
          {course.title} · {t("lessonLabel", { order: lesson.order })}
        </p>
        <h1 className="text-2xl-semi text-ui-fg-base">{lesson.title}</h1>
      </div>

      <CourseProgress progress={progress} data-testid="course-lesson-progress" />

      {lesson.video_url && (
        // eslint-disable-next-line jsx-a11y/media-has-caption -- no seeded lesson carries a caption track yet
        <video controls src={lesson.video_url} className="w-full rounded-large" />
      )}
      <LessonBody source={lesson.body} />

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-ui-border-base pt-6">
        <LessonViewedButton
          courseId={course.id}
          lessonId={lesson.id}
          initialViewed={Boolean(lesson.viewed_at)}
        />
        {nextLessonId ? (
          <Link
            href={courseLessonHref(course.slug, nextLessonId)}
            className="inline-flex items-center rounded-medium border border-ui-border-base px-4 py-2.5 text-sm font-medium text-ui-fg-base transition-colors hover:bg-ui-bg-subtle"
            data-testid="next-lesson"
          >
            {t("next")}
          </Link>
        ) : (
          <Link
            href="/account/courses"
            className="inline-flex items-center rounded-medium border border-ui-border-base px-4 py-2.5 text-sm font-medium text-ui-fg-base transition-colors hover:bg-ui-bg-subtle"
            data-testid="finish-course"
          >
            {t("finish")}
          </Link>
        )}
      </div>

      {prevLessonId && (
        <Link
          href={courseLessonHref(course.slug, prevLessonId)}
          className="self-start text-sm text-ui-fg-subtle hover:text-ui-fg-base transition-colors"
          data-testid="prev-lesson"
        >
          {t("prev")}
        </Link>
      )}
    </div>
  )
}
