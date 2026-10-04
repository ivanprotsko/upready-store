import { getTranslations } from "next-intl/server"
import { Link } from "@i18n/navigation"
import type {
  CourseLesson as CourseLessonContent,
  LessonQuiz as LessonQuizContent,
  MyCourseContents,
} from "@lib/data/courses"
import { courseContentsHref } from "@lib/util/course-links"
import { flowTargetHref, lessonFlowTargets } from "@lib/util/lesson-flow"
import LessonQuiz from "@modules/account/components/lesson-quiz"
import ChevronDown from "@modules/common/icons/chevron-down"

/**
 * The test step after a lesson (ask-20261005-061005-2e78), at
 * `/account/courses/<slug>/lessons/<id>/test`: the lesson it belongs to, its
 * questions one by one (`LessonQuiz`), and the same bottom bar as the lesson,
 * «Назад» back to the lesson and «Дальше» on to the next one.
 */
export default async function CourseLessonTest({
  data,
  lesson,
  quiz,
}: {
  data: MyCourseContents
  lesson: CourseLessonContent
  quiz: LessonQuizContent
}) {
  const t = await getTranslations("CourseBlock")
  const { course, lessons, progress } = data
  const flowLessons = lessons.map((row) =>
    row.id === lesson.id ? { id: row.id, has_quiz: true } : row
  )
  const { back, next } = lessonFlowTargets(flowLessons, {
    lessonId: lesson.id,
    test: true,
  })

  return (
    <div className="flex flex-col gap-y-6" data-testid="course-lesson-test">
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
          {course.title} · {t("lessonLabel", { order: lesson.order })} · {t("testLabel")}
        </p>
        <h1 className="text-2xl-semi text-ui-fg-base">{lesson.title}</h1>
      </div>

      <LessonQuiz
        quiz={quiz}
        progress={progress}
        back={{ label: t("stepBack"), href: flowTargetHref(course.slug, back) }}
        next={{
          label: next.kind === "finish" ? t("finish") : t("stepNext"),
          href: flowTargetHref(course.slug, next),
        }}
      />
    </div>
  )
}
