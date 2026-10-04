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

/**
 * The test after a lesson (ask-20261005-061005-2e78): up to three questions,
 * each with two to four options and `correct`, the index of the right one.
 * A self-check scored on the page; nothing about an answer is sent back.
 */
export type LessonQuiz = {
  questions: Array<{
    text: string
    options: string[]
    correct: number
  }>
}

export type CourseLesson = {
  id: string
  course_id: string
  title: string
  order: number
  body: string
  video_url: string | null
  quiz: LessonQuiz | null
  viewed_at: string | null
}

/**
 * One entry of «Мои курсы». The backend lists a course the customer ordered
 * but has not paid for too, `access: false` with `progress: null`; the page
 * reads those off the orders instead (`pendingCoursesFromOrders`) and keeps
 * only `access: true` entries for the cards. `continue_lesson_id` is the
 * lesson the card's «Продолжить» opens, `null` while nothing is viewed yet
 * (ask-20261005-053807-eaae).
 */
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
  access: boolean
  progress: CourseProgress | null
  continue_lesson_id: string | null
}

export type MyCourseLesson = {
  id: string
  title: string
  order: number
  viewed_at: string | null
  /** Whether a test follows the lesson, the step «Назад» and «Дальше» count in. */
  has_quiz: boolean
}

/** A bought course's contents in the account, lessons in course order. */
export type MyCourseContents = {
  course: {
    id: string
    title: string
    slug: string
    description: string | null
  }
  lessons: MyCourseLesson[]
  progress: CourseProgress
  continue_lesson_id: string | null
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

/**
 * Counts a lesson as done (ask-20261005-061005-2e78: once its video played to
 * the end, or its text was read to the end). Idempotent, returns the course's
 * fresh progress, `null` when the backend did not take it.
 */
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

/**
 * One bought course's contents for the account, by the course's slug
 * (ask-20261005-053807-eaae). `null` for a slug this shop does not have, a
 * course this customer holds no access to, or a backend that did not answer;
 * the pages send each of those back to «Мои курсы».
 */
export const getMyCourse = async (
  slug: string
): Promise<MyCourseContents | null> => {
  const headers = { ...(await getAuthHeaders()) }

  return await sdk.client
    .fetch<MyCourseContents>(
      `/store/tenant/courses/mine/${encodeURIComponent(slug)}`,
      {
        headers,
        cache: "no-store",
      }
    )
    .catch(() => null)
}
