import { notFound, redirect } from "next/navigation"
import { getLocale } from "next-intl/server"
import { listProducts } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { getCountryCode } from "@lib/data/cookies"
import { decodeSegment } from "@lib/util/decode-segment"
import { getProductCourse } from "@lib/data/courses"
import { courseLessonHref } from "@lib/util/course-links"
import { DEFAULT_REGION } from "@lib/util/env"

type Props = {
  params: Promise<{ handle: string; lessonId: string }>
}

/** The slug of the course this product sells, `null` for any other product. */
const resolveCourseSlug = async (handle: string) => {
  const countryCode = (await getCountryCode()) ?? DEFAULT_REGION
  const region = await getRegion(countryCode)
  if (!region) return null

  const product = await listProducts({
    countryCode,
    queryParams: { handle: decodeSegment(handle) },
  }).then(({ response }) => response.products[0])
  if (!product?.id) return null

  const data = await getProductCourse(product.id)

  return data?.course.slug ?? null
}

/**
 * The lesson's old address on the course's product page. A lesson lives in
 * the account now (ask-20261005-053807-eaae, Ivan 05.10: «Курс всегда в
 * личном кабинете»), so this only redirects there, whoever asks: the account
 * page decides itself what a buyer without access or a signed-out visitor
 * sees. A product that sells no course stays a 404.
 */
export default async function LegacyLessonPage(props: Props) {
  const [params, locale] = await Promise.all([props.params, getLocale()])
  const slug = await resolveCourseSlug(params.handle)

  if (!slug) {
    notFound()
  }

  redirect(
    `/${locale}${courseLessonHref(slug, decodeSegment(params.lessonId))}`
  )
}
