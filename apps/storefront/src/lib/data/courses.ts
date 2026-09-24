"use server"

/**
 * o24-courses part (c): the storefront's own reads/writes against
 * `/store/tenant/courses/*` (`apps/backend/src/api/store/tenant/courses`).
 * The backend never sends lesson `body`/`video_url` from the list route — the
 * player route is the only place that content leaves the server — so the
 * types below mirror that split rather than one shared "lesson" shape.
 */

import { sdk } from "@lib/config"
import { getAuthHeaders } from "./cookies"

export type CourseLessonSummary = {
  id: string
  title: string
  order: number
  locked: boolean
}

export type CourseProgress = {
  completed: number
  total: number
  percent: number
}

export type ProductCourse = {
  course: {
    id: string
    product_id: string
    title: string
    slug: string
    description: string | null
  }
  lessons: CourseLessonSummary[]
  has_access: boolean
  progress: CourseProgress | null
}

export type CourseLesson = {
  id: string
  course_id: string
  title: string
  order: number
  body: string
  video_url: string | null
  viewed_at: string | null
}

export type MyCourse = {
  id: string
  title: string
  slug: string
  product: {
    id: string
    title: string
    handle: string
    thumbnail: string | null
  } | null
  progress: CourseProgress
}

/**
 * The product page's course block, or `null` for a product that sells no
 * course (the common case — most products never call this) or one owned by
 * another tenant. Not cached: `has_access`/`progress` are per-customer.
 */
export const getProductCourse = async (
  productId: string
): Promise<ProductCourse | null> => {
  const headers = { ...(await getAuthHeaders()) }

  return await sdk.client
    .fetch<ProductCourse>("/store/tenant/courses", {
      query: { product_id: productId },
      headers,
      cache: "no-store",
    })
    .catch(() => null)
}

/**
 * One lesson's full content plus this customer's `viewed_at`. `null` for a
 * lesson that does not exist, belongs to another tenant, or that this
 * customer has not bought — the backend's `assertCourseAccess` refuses the
 * body/video URL rather than answering a locked shell.
 */
export const getCourseLesson = async (
  courseId: string,
  lessonId: string
): Promise<CourseLesson | null> => {
  const headers = { ...(await getAuthHeaders()) }

  return await sdk.client
    .fetch<{ lesson: CourseLesson }>(
      `/store/tenant/courses/${courseId}/lessons/${lessonId}`,
      {
        headers,
        cache: "no-store",
      }
    )
    .then(({ lesson }) => lesson)
    .catch(() => null)
}

/** «Отметить просмотренным» — idempotent, returns the course's fresh progress. */
export const markLessonViewed = async (
  courseId: string,
  lessonId: string
): Promise<CourseProgress | null> => {
  const headers = { ...(await getAuthHeaders()) }

  return await sdk.client
    .fetch<{ progress: CourseProgress }>(
      `/store/tenant/courses/${courseId}/lessons/${lessonId}/viewed`,
      { method: "POST", headers }
    )
    .then(({ progress }) => progress)
    .catch(() => null)
}

/** «Мои курсы» — every course this customer holds a live entitlement for. */
export const listMyCourses = async (): Promise<MyCourse[]> => {
  const headers = { ...(await getAuthHeaders()) }

  return await sdk.client
    .fetch<{ courses: MyCourse[] }>("/store/tenant/courses/mine", {
      headers,
      cache: "no-store",
    })
    .then(({ courses }) => courses)
    .catch(() => [])
}
