import { cache } from "react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { getCourseLesson, getMyCourse } from "@lib/data/courses"
import { courseContentsHref } from "@lib/util/course-links"
import { decodeSegment } from "@lib/util/decode-segment"
import { flowTargetHref, lessonFlowTargets } from "@lib/util/lesson-flow"
import { pageTitle } from "@lib/util/page-title"
import CourseLessonTest from "@modules/account/components/course-lesson-test"

type Props = {
  params: Promise<{ slug: string; lessonId: string }>
}

/** One backend read for the title and the page alike. */
const loadCourse = cache(getMyCourse)

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params
  const [data, t] = await Promise.all([
    loadCourse(decodeSegment(params.slug)),
    getTranslations("CourseBlock"),
  ])
  const lessonId = decodeSegment(params.lessonId)
  const lesson = data?.lessons.find((row) => row.id === lessonId)

  return {
    title: await pageTitle(
      lesson ? t("testTitle", { title: lesson.title }) : (data?.course.title ?? "")
    ),
  }
}

/**
 * The test after a lesson in the account (ask-20261005-061005-2e78). No
 * access, or a slug the shop does not have, goes back to «Мои курсы», a
 * lesson the course no longer has to the course's contents, the way the
 * lesson page sends them; a lesson with no test goes on to the step after it,
 * so an old link to a test that was taken away still leads forward.
 */
export default async function CourseLessonTestPage(props: Props) {
  const [params, locale] = await Promise.all([props.params, getLocale()])
  const data = await loadCourse(decodeSegment(params.slug))

  if (!data) {
    redirect(`/${locale}/account/courses`)
  }

  const lessonId = decodeSegment(params.lessonId)
  const lesson = data.lessons.some((row) => row.id === lessonId)
    ? await getCourseLesson(data.course.id, lessonId)
    : null

  if (!lesson) {
    redirect(`/${locale}${courseContentsHref(data.course.slug)}`)
  }

  if (!lesson.quiz) {
    const { next } = lessonFlowTargets(
      data.lessons.map((row) => (row.id === lesson.id ? { id: row.id, has_quiz: false } : row)),
      { lessonId: lesson.id, test: false }
    )
    redirect(`/${locale}${flowTargetHref(data.course.slug, next)}`)
  }

  return <CourseLessonTest data={data} lesson={lesson} quiz={lesson.quiz} />
}
