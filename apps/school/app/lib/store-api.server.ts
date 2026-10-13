import { data, redirect } from "react-router"
import { readConfig, type SchoolConfig } from "./config.server"
import { fixtureAnswer, isFixtureMode } from "./fixture.server"
import { publicApiOrigin } from "./media"
import { loginPath, requestPath } from "./next-path"
import { clearTokenCookie, readToken } from "./session.server"
import type { CourseContents, LessonContent, LessonResult, MyCourse, CourseProgress } from "./types"
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
 * - 403 and 404: the same status, for the page's error view, apart from a
 *   lesson whose day has not come (403 `lesson_locked`), which the lesson
 *   page shows itself;
 * - anything else: 502, «the shop did not answer».
 *
 * With `SCHOOL_FIXTURE=1` the answers come from the fixture files
 * (`fixture.server.ts`) and no cookie is asked for.
 */

type Session = {
  config: SchoolConfig
  token: string
  request: Request
  /** The origin a bare `/…` media path is resolved against for the browser (`media.ts`). */
  mediaOrigin: string | null
}

/** The buyer's session, or a redirect to sign-in that brings them back to this page. */
export function requireSession(request: Request): Session {
  const config = readConfig()

  if (isFixtureMode()) {
    return { config, token: "fixture", request, mediaOrigin: new URL(request.url).origin }
  }

  const token = readToken(request)

  if (!token) {
    throw redirect(loginPath(requestPath(request)))
  }

  return { config, token, request, mediaOrigin: publicApiOrigin(config.apiBase) }
}

async function send(
  { config, token, request }: Session,
  path: string,
  init: { method?: "GET" | "POST" } = {},
): Promise<Response> {
  if (isFixtureMode()) {
    return fixtureAnswer(path, init.method ?? "GET")
  }

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

  return response
}

async function readAnswer<T>(response: Response): Promise<T> {
  if (response.status === 403 || response.status === 404) {
    throw data({ message: response.status === 403 ? "no-access" : "not-found" }, { status: response.status })
  }

  if (!response.ok) {
    throw data({ message: "shop-error" }, { status: 502 })
  }

  return (await response.json()) as T
}

async function callApi<T>(session: Session, path: string, init: { method?: "GET" | "POST" } = {}): Promise<T> {
  return readAnswer<T>(await send(session, path, init))
}

const segment = (value: string) => encodeURIComponent(value)

export async function listMyCourses(session: Session): Promise<MyCourse[]> {
  const body = await callApi<{ courses?: MyCourse[] }>(session, "/store/tenant/courses/mine")

  return body.courses ?? []
}

export function getCourseContents(session: Session, slug: string): Promise<CourseContents> {
  return callApi<CourseContents>(session, `/store/tenant/courses/mine/${segment(slug)}`)
}

/**
 * The answer of the backend's media route, for `routes/app-media.ts`: its
 * redirect to the file (a presigned address) as the browser's redirect, or
 * the file itself when the route serves it. `path` is checked by the caller.
 */
export async function openMedia(session: Session, path: string): Promise<Response> {
  if (isFixtureMode()) {
    return new Response("", { status: 404 })
  }

  let response: Response

  try {
    response = await fetch(`${session.config.apiBase}${path}`, {
      headers: shopApiHeaders({ token: session.token, publishableKey: session.config.publishableKey }),
      redirect: "manual",
    })
  } catch {
    throw data({ message: "shop-unreachable" }, { status: 502 })
  }

  const location = response.headers.get("location")

  if (response.status >= 300 && response.status < 400 && location) {
    return new Response(null, { status: 302, headers: { location, "cache-control": "private, no-store" } })
  }

  if (response.status === 401) {
    throw redirect(loginPath(requestPath(session.request)), { headers: { "set-cookie": clearTokenCookie() } })
  }

  if (!response.ok) {
    return new Response("", { status: response.status === 403 || response.status === 404 ? response.status : 502 })
  }

  const headers = new Headers()
  for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "content-disposition"]) {
    const value = response.headers.get(name)
    if (value) headers.set(name, value)
  }
  headers.set("cache-control", "private, no-store")

  return new Response(response.body, { status: response.status, headers })
}

/** The lesson, or `locked` with the date it opens when the API answers 403 `lesson_locked`. */
export async function getLesson(session: Session, courseId: string, lessonId: string): Promise<LessonResult> {
  const response = await send(session, `/store/tenant/courses/${segment(courseId)}/lessons/${segment(lessonId)}`)

  if (response.status === 403) {
    const body = (await response
      .clone()
      .json()
      .catch(() => null)) as { code?: string; opens_at?: string | null } | null

    if (body?.code === "lesson_locked") {
      return { kind: "locked", opens_at: body.opens_at ?? null }
    }
  }

  const body = await readAnswer<{ lesson: LessonContent }>(response)

  return { kind: "lesson", lesson: body.lesson }
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
