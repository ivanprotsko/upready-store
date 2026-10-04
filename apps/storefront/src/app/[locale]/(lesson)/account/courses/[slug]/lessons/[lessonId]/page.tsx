import { cache } from "react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getLocale } from "next-intl/server"
import { getCourseLesson, getMyCourse } from "@lib/data/courses"
import { courseContentsHref } from "@lib/util/course-links"
import { decodeSegment } from "@lib/util/decode-segment"
import { pageTitle } from "@lib/util/page-title"
import CourseLesson from "@modules/account/components/course-lesson"

type Props = {
  params: Promise<{ slug: string; lessonId: string }>
}

/** One backend read for the title and the page alike. */
const loadCourse = cache(getMyCourse)

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params
  const data = await loadCourse(decodeSegment(params.slug))
  const lessonId = decodeSegment(params.lessonId)
  const lesson = data?.lessons.find((row) => row.id === lessonId)

  return {
    title: await pageTitle(lesson?.title ?? data?.course.title ?? ""),
  }
}

/**
 * One lesson of a bought course in the account (ask-20261005-053807-eaae).
 * No access, or a slug the shop does not have, goes back to «Мои курсы»; a
 * lesson the course no longer has goes to the course's contents rather than
 * to a 404, the way an old link to a removed lesson should land.
 */
export default async function CourseLessonPage(props: Props) {
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

  return <CourseLesson data={data} lesson={lesson} />
}
