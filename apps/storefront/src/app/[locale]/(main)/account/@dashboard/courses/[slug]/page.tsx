import { cache } from "react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getLocale } from "next-intl/server"
import { getMyCourse } from "@lib/data/courses"
import { decodeSegment } from "@lib/util/decode-segment"
import { pageTitle } from "@lib/util/page-title"
import CourseContents from "@modules/account/components/course-contents"

type Props = {
  params: Promise<{ slug: string }>
}

/** One backend read for the title and the page alike. */
const loadCourse = cache(getMyCourse)

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params
  const data = await loadCourse(decodeSegment(params.slug))

  return {
    title: await pageTitle(data?.course.title ?? ""),
  }
}

/**
 * A bought course's contents in the account (ask-20261005-053807-eaae). A
 * course this customer has no access to, or a slug the shop does not have,
 * goes back to «Мои курсы»; a signed-out visitor never gets here, the
 * middleware and the account layout send them to the sign-in form first.
 */
export default async function CourseContentsPage(props: Props) {
  const params = await props.params
  const data = await loadCourse(decodeSegment(params.slug))

  if (!data) {
    redirect(`/${await getLocale()}/account/courses`)
  }

  return <CourseContents data={data} />
}
