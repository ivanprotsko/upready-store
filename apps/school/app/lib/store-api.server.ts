import { data, redirect } from "react-router"
import { readConfig, type SchoolConfig } from "./config.server"
import { loginPath, requestPath } from "./next-path"
import { clearTokenCookie, readToken } from "./session.server"
import type { CourseContents, LessonContent, MyCourse, CourseProgress } from "./types"
import { shopApiHeaders } from "./vendor/shop-sso"

/**
 * The school's only way into the shop: the Store API's course routes
 * (apps/backend/src/api/store/tenant/courses), called from the school's
 * server with the buyer's token and the shop's publishable key, the headers
 * `@upready/shop-sso` builds. The browser never talks to the API.
 *
 * Every answer the page cannot use turns into a response here, so a loader
 * reads as the happy path:
 * - no cookie, or 401 from the API: to `/login?next=<this page>`, the stale
 *   cookie removed on the way;
 * - 403 and 404: the same status, for the page's error view;
 * - anything else: 502, «the shop did not answer».
 */

type Session = { config: SchoolConfig; token: string; request: Request }

/** The buyer's session, or a redirect to sign-in that brings them back to this page. */
export function requireSession(request: Request): Session {
  const config = readConfig()
  const token = readToken(request)

  if (!token) {
    throw redirect(loginPath(requestPath(request)))
  }

  return { config, token, request }
}

async function callApi<T>(
  { config, token, request }: Session,
  path: string,
  init: { method?: "GET" | "POST" } = {},
): Promise<T> {
  let response: Response

  try {
    response = await fetch(`${config.apiBase}${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...shopApiHeaders({ token, publishableKey: config.publishableKey }),
        accept: "application/json",
        // Course and lesson titles in Russian, the language of the school.
        "x-medusa-locale": "ru",
        ...(init.method === "POST" ? { "content-type": "application/json" } : {}),
      },
      body: init.method === "POST" ? "{}" : undefined,
    })
  } catch {
    throw data({ message: "shop-unreachable" }, { status: 502 })
  }

  if (response.status === 401) {
    throw redirect(loginPath(requestPath(request)), {
      headers: { "set-cookie": clearTokenCookie() },
    })
  }

  if (response.status === 403 || response.status === 404) {
    throw data({ message: response.status === 403 ? "no-access" : "not-found" }, { status: response.status })
  }

  if (!response.ok) {
    throw data({ message: "shop-error" }, { status: 502 })
  }

  return (await response.json()) as T
}

const segment = (value: string) => encodeURIComponent(value)

export async function listMyCourses(session: Session): Promise<MyCourse[]> {
  const body = await callApi<{ courses?: MyCourse[] }>(session, "/store/tenant/courses/mine")

  return body.courses ?? []
}

export function getCourseContents(session: Session, slug: string): Promise<CourseContents> {
  return callApi<CourseContents>(session, `/store/tenant/courses/mine/${segment(slug)}`)
}

export async function getLesson(session: Session, courseId: string, lessonId: string): Promise<LessonContent> {
  const body = await callApi<{ lesson: LessonContent }>(
    session,
    `/store/tenant/courses/${segment(courseId)}/lessons/${segment(lessonId)}`,
  )

  return body.lesson
}

export async function markLessonViewed(
  session: Session,
  courseId: string,
  lessonId: string,
): Promise<CourseProgress> {
  const body = await callApi<{ progress: CourseProgress }>(
    session,
    `/store/tenant/courses/${segment(courseId)}/lessons/${segment(lessonId)}/viewed`,
    { method: "POST" },
  )

  return body.progress
}
