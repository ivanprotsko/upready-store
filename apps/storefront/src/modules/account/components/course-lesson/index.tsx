import { getTranslations } from "next-intl/server"
import { Link } from "@i18n/navigation"
import type { CourseLesson as CourseLessonContent, MyCourseContents } from "@lib/data/courses"
import { courseContentsHref } from "@lib/util/course-links"
import { flowTargetHref, lessonFlowTargets } from "@lib/util/lesson-flow"
import LessonBody from "@modules/account/components/lesson-body"
import LessonCredit from "@modules/account/components/lesson-credit"
import LessonCreditBar from "@modules/account/components/lesson-credit-bar"
import LessonReadMarker from "@modules/account/components/lesson-read-marker"
import LessonVideo from "@modules/account/components/lesson-video"
import ChevronDown from "@modules/common/icons/chevron-down"

/**
 * One lesson of a bought course, in the account (ask-20261005-053807-eaae):
 * the video, the text (typeset by `LessonBody`, ask-20261005-054319-4ad4) and
 * the way back to the course's contents. Since ask-20261005-061005-2e78 the
 * lesson counts by itself, its video watched to the end or its text read to
 * the end (`LessonCredit`), and the course's steps are the bar pinned to the
 * bottom: «Назад», «Дальше» and the progress strip (`LessonCreditBar`).
 * `data` is the course's contents (`getMyCourse`), which give the lesson
 * order, the tests and the progress; `lesson` is the player route's answer
 * with the body, the video and the test.
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
  // The lesson's own answer knows its test for certain; the contents only say whether it has one.
  const flowLessons = lessons.map((row) =>
    row.id === lesson.id ? { id: row.id, has_quiz: lesson.quiz !== null } : row
  )
  const { back, next } = lessonFlowTargets(flowLessons, {
    lessonId: lesson.id,
    test: false,
  })

  return (
    <LessonCredit
      key={lesson.id}
      courseId={course.id}
      lessonId={lesson.id}
      hasVideo={Boolean(lesson.video_url)}
      initialCredited={Boolean(lesson.viewed_at)}
      initialProgress={progress}
    >
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

        {lesson.video_url && <LessonVideo src={lesson.video_url} />}
        <div className="flex flex-col">
          <LessonBody source={lesson.body} />
          <LessonReadMarker />
        </div>
      </div>

      <LessonCreditBar
        back={{ label: t("stepBack"), href: flowTargetHref(course.slug, back) }}
        next={{
          label: next.kind === "finish" ? t("finish") : t("stepNext"),
          href: flowTargetHref(course.slug, next),
        }}
      />
    </LessonCredit>
  )
}
