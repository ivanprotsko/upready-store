import { renderToString } from "react-dom/server"
import { createStaticHandler, createStaticRouter, Outlet, StaticRouterProvider, type RouteObject } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as appCourse from "./app-course"
import * as appCourses from "./app-courses"
import * as appLayout from "./app-layout"
import * as appLesson from "./app-lesson"
import * as authCallback from "./auth-callback"
import * as login from "./login"
import * as logout from "./logout"

/**
 * The pages end to end on the server: a request goes through the real route
 * modules (loader, action, component, error view) in a static router, and the
 * shop's API is a fake `fetch` that answers by path.
 */

const routes: RouteObject[] = [
  {
    id: "test-root",
    path: "/",
    Component: Outlet,
    children: [
      { id: "routes/login", path: "login", loader: login.loader, Component: login.default },
      { id: "routes/auth-callback", path: "auth/callback", loader: authCallback.loader },
      { id: "routes/logout", path: "logout", loader: logout.loader, action: logout.action },
      {
        id: "routes/app-layout",
        path: "app",
        loader: appLayout.loader,
        Component: appLayout.default,
        ErrorBoundary: appLayout.ErrorBoundary,
        children: [
          { id: "routes/app-courses", index: true, loader: appCourses.loader, Component: appCourses.default },
          { id: "routes/app-course", path: ":slug", loader: appCourse.loader, Component: appCourse.default },
          {
            id: "routes/app-lesson",
            path: ":slug/:lessonId",
            loader: appLesson.loader,
            action: appLesson.action,
            Component: appLesson.default,
          },
        ],
      },
    ],
  },
]

const SIGNED_IN = "school_jwt=jwt-buyer"

/** An `<a>` with this address and this test id, whatever order the attributes come in. */
const linkTo = (href: string, testId: string) =>
  new RegExp(`<a(?=[^>]*href="${href}")(?=[^>]*data-testid="${testId}")[^>]*>`)

type Answer = Response | ((init: RequestInit | undefined) => Response)

let api: Record<string, Answer>
let calls: { url: string; init: RequestInit | undefined }[]

beforeEach(() => {
  vi.stubEnv("SCHOOL_DOMAIN", "school.cherkashina.ru")
  vi.stubEnv("SCHOOL_API_BASE", "http://api.test")
  vi.stubEnv("SCHOOL_PUBLISHABLE_KEY", "pk_school")
  vi.stubEnv("SCHOOL_SHOP_ORIGIN", "https://cherkashino.ru")
  api = {}
  calls = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, init })
      const answer = api[`${init?.method ?? "GET"} ${new URL(url).pathname}`]

      if (!answer) {
        return new Response("not mocked", { status: 500 })
      }

      return typeof answer === "function" ? answer(init) : answer.clone()
    }),
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

async function open(path: string, { cookie, method = "GET" }: { cookie?: string; method?: string } = {}) {
  const handler = createStaticHandler(routes)
  const request = new Request(`https://school.cherkashina.ru${path}`, {
    method,
    headers: cookie ? { cookie } : {},
    body: method === "POST" ? new URLSearchParams() : undefined,
  })
  const context = await handler.query(request)

  if (context instanceof Response) {
    return { response: context, html: "", status: context.status }
  }

  const router = createStaticRouter(handler.dataRoutes, context)
  const html = renderToString(<StaticRouterProvider router={router} context={context} hydrate={false} />)

  return { response: null, html, status: context.statusCode }
}

const course = {
  id: "course_1",
  title: "Йога для спины",
  slug: "yoga",
  product: { id: "prod_1", title: "Йога", handle: "yoga", thumbnail: "https://cdn.test/yoga.jpg" },
  access: true,
  progress: { completed: 1, total: 3, percent: 33 },
  continue_lesson_id: "les_2",
  order: null,
}

const contents = {
  course: { id: "course_1", title: "Йога для спины", slug: "yoga", description: "Три урока.\n\nПо 15 минут." },
  lessons: [
    { id: "les_1", title: "Дыхание", order: 0, viewed_at: "2026-10-01T10:00:00Z", has_quiz: false },
    { id: "les_2", title: "Растяжка", order: 1, viewed_at: null, has_quiz: true },
    { id: "les_3", title: "Отдых", order: 2, viewed_at: null, has_quiz: false },
  ],
  progress: { completed: 1, total: 3, percent: 33 },
  continue_lesson_id: "les_2",
}

const lesson = {
  id: "les_2",
  course_id: "course_1",
  title: "Растяжка",
  order: 1,
  body: "## Разминка\n\n- Наклоны\n- Повороты\n\nФайл «Схема»: https://cdn.test/plan.pdf",
  video_url: "https://cdn.test/les_2.mp4",
  quiz: { questions: [{ text: "Сколько подходов?", options: ["Один", "Три"], correct: 1 }] },
  viewed_at: null,
}

describe("without the cookie", () => {
  it.each(["/app", "/app/yoga", "/app/yoga/les_2"])("%s sends the buyer to /login and back", async (path) => {
    const { response } = await open(path)

    expect(response?.status).toBe(302)
    expect(response?.headers.get("location")).toBe(`/login?next=${encodeURIComponent(path)}`)
    expect(calls).toHaveLength(0)
  })
})

describe("/login", () => {
  it("shows «Войти» leading to the shop's sign-in by the shared contract", async () => {
    const { html, status } = await open("/login?next=%2Fapp%2Fyoga")
    const href = /data-testid="login-button"[^>]*href="([^"]+)"|href="([^"]+)"[^>]*data-testid="login-button"/.exec(html)
    const loginUrl = new URL((href?.[1] ?? href?.[2] ?? "").replaceAll("&amp;", "&"))

    expect(status).toBe(200)
    expect(html).toContain("Войти")
    expect(loginUrl.origin + loginUrl.pathname).toBe("https://cherkashino.ru/api/school-sso")
    expect(loginUrl.searchParams.get("return_to")).toBe(
      "https://school.cherkashina.ru/auth/callback?next=%2Fapp%2Fyoga",
    )
  })

  it("says why the last attempt failed", async () => {
    const { html } = await open("/login?error=expired")

    expect(html).toContain("Ссылка для входа устарела")
  })

  it("lets a signed-in buyer straight through", async () => {
    const { response } = await open("/login?next=%2Fapp%2Fyoga", { cookie: SIGNED_IN })

    expect(response?.headers.get("location")).toBe("/app/yoga")
  })
})

describe("/auth/callback", () => {
  it("trades the code for the token, keeps it in school_jwt and opens the page", async () => {
    api["POST /store/tenant/sso/exchange"] = Response.json({ token: "jwt-new" })

    const { response } = await open("/auth/callback?next=%2Fapp%2Fyoga&code=c1")

    expect(response?.status).toBe(302)
    expect(response?.headers.get("location")).toBe("/app/yoga")
    expect(response?.headers.get("set-cookie")).toMatch(/^school_jwt=jwt-new; Path=\/; HttpOnly; Secure; SameSite=Lax/)
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ code: "c1" }))
    expect(new Headers(calls[0]?.init?.headers).get("x-publishable-api-key")).toBe("pk_school")
  })

  it("sends a used or stale code back to /login with the reason, and sets no cookie", async () => {
    api["POST /store/tenant/sso/exchange"] = new Response("", { status: 401 })

    const { response } = await open("/auth/callback?next=%2Fapp&code=used")

    expect(response?.headers.get("location")).toBe("/login?next=%2Fapp&error=expired")
    expect(response?.headers.get("set-cookie")).toBeNull()
  })

  it.each([
    ["a server error", () => new Response("", { status: 500 })],
    ["an answer without a token", () => Response.json({ token: "" })],
    [
      "no answer at all",
      () => {
        throw new TypeError("fetch failed")
      },
    ],
  ])("catches the package's refusal on %s and sends the buyer to /login, not to a 500", async (_, answer) => {
    api["POST /store/tenant/sso/exchange"] = answer

    const { response } = await open("/auth/callback?next=%2Fapp%2Fyoga&code=c1")

    expect(response?.status).toBe(302)
    expect(response?.headers.get("location")).toBe("/login?next=%2Fapp%2Fyoga&error=failed")
    expect(response?.headers.get("set-cookie")).toBeNull()
  })

  it("does not call the API without a code", async () => {
    const { response } = await open("/auth/callback?next=%2Fapp")

    expect(response?.headers.get("location")).toBe("/login?next=%2Fapp&error=missing")
    expect(calls).toHaveLength(0)
  })
})

describe("/logout", () => {
  it("removes school_jwt and only it", async () => {
    const { response } = await open("/logout", { cookie: SIGNED_IN, method: "POST" })

    expect(response?.headers.get("location")).toBe("/login?next=%2Fapp")
    expect(response?.headers.get("set-cookie")).toMatch(/^school_jwt=; .*Max-Age=0/)
  })
})

describe("/app", () => {
  it("lists the buyer's courses with progress, asking the API with the token and the shop's key", async () => {
    api["GET /store/tenant/courses/mine"] = Response.json({
      courses: [
        course,
        {
          ...course,
          id: "course_2",
          title: "Пилатес",
          slug: "pilates",
          access: false,
          progress: null,
          continue_lesson_id: null,
          order: { id: "order_9", display_id: 1042 },
        },
      ],
    })

    const { html, status } = await open("/app", { cookie: SIGNED_IN })
    const headers = new Headers(calls[0]?.init?.headers)

    expect(status).toBe(200)
    expect(headers.get("authorization")).toBe("Bearer jwt-buyer")
    expect(headers.get("x-publishable-api-key")).toBe("pk_school")
    expect(html).toContain("Йога для спины")
    expect(html).toContain("Пройдено 1 из 3 уроков")
    expect(html).toContain('href="/app/yoga/les_2"')
    expect(html).toContain("Продолжить")
    expect(html).toContain("Ждёт оплаты")
    expect(html).toContain("заказа № 1042")
    expect(html).toContain('href="https://cherkashino.ru/account/orders/details/order_9"')
    expect(html).toContain("Выйти")
  })

  it("says so when the buyer has no courses", async () => {
    api["GET /store/tenant/courses/mine"] = Response.json({ courses: [] })

    const { html } = await open("/app", { cookie: SIGNED_IN })

    expect(html).toContain('data-testid="courses-empty"')
    expect(html).toContain("Здесь пока нет курсов")
  })

  it("drops a token the API refuses and asks the buyer to sign in again", async () => {
    api["GET /store/tenant/courses/mine"] = new Response("", { status: 401 })

    const { response } = await open("/app", { cookie: SIGNED_IN })

    expect(response?.headers.get("location")).toBe("/login?next=%2Fapp")
    expect(response?.headers.get("set-cookie")).toMatch(/^school_jwt=; .*Max-Age=0/)
  })

  it("shows the error view, with the header, when the API fails", async () => {
    api["GET /store/tenant/courses/mine"] = new Response("", { status: 500 })

    const { html, status } = await open("/app", { cookie: SIGNED_IN })

    expect(status).toBe(502)
    expect(html).toContain('data-status="502"')
    expect(html).toContain("Магазин не ответил")
    expect(html).toContain("Выйти")
  })
})

describe("/app/<course>", () => {
  it("shows the lessons in order, which are done and where to continue", async () => {
    api["GET /store/tenant/courses/mine/yoga"] = Response.json(contents)

    const { html } = await open("/app/yoga", { cookie: SIGNED_IN })

    expect(html).toContain("Йога для спины")
    expect(html).toContain("По 15 минут.")
    expect(html.indexOf("Дыхание")).toBeLessThan(html.indexOf("Растяжка"))
    expect(html).toContain("Пройден")
    expect(html).toContain("есть тест")
    expect(html).toMatch(linkTo("/app/yoga/les_2", "continue-button"))
  })

  it("says so when the course has no lessons yet", async () => {
    api["GET /store/tenant/courses/mine/yoga"] = Response.json({
      ...contents,
      lessons: [],
      progress: { completed: 0, total: 0, percent: 0 },
      continue_lesson_id: null,
    })

    const { html } = await open("/app/yoga", { cookie: SIGNED_IN })

    expect(html).toContain('data-testid="lessons-empty"')
    expect(html).not.toContain("continue-button")
  })

  it("explains a course the buyer has no access to", async () => {
    api["GET /store/tenant/courses/mine/yoga"] = new Response("", { status: 403 })

    const { html, status } = await open("/app/yoga", { cookie: SIGNED_IN })

    expect(status).toBe(403)
    expect(html).toContain("Курс пока закрыт")
  })
})

describe("/app/<course>/<lesson>", () => {
  beforeEach(() => {
    api["GET /store/tenant/courses/mine/yoga"] = Response.json(contents)
    api["GET /store/tenant/courses/course_1/lessons/les_2"] = Response.json({ lesson })
  })

  it("shows the video, the typeset text, the test and «Отметить пройденным»", async () => {
    const { html } = await open("/app/yoga/les_2", { cookie: SIGNED_IN })

    expect(html).toContain("Урок 2 из 3")
    expect(html).toContain('src="https://cdn.test/les_2.mp4"')
    // `##` is a third-level heading, the same as in the shop's account (`vendor/lesson-body.ts`).
    expect(html).toMatch(/<h3[^>]*>Разминка<\/h3>/)
    expect(html).toMatch(/<li[^>]*>Наклоны<\/li>/)
    expect(html).toContain("Скачать «Схема» — PDF")
    expect(html).not.toContain(">https://cdn.test/plan.pdf<")
    expect(html).toContain("Сколько подходов?")
    expect(html).toContain("Отметить пройденным")
    expect(html).toMatch(linkTo("/app/yoga/les_3", "next-lesson"))
  })

  it("marks the lesson viewed through the API and shows it done", async () => {
    let viewed = false
    api["POST /store/tenant/courses/course_1/lessons/les_2/viewed"] = () => {
      viewed = true

      return Response.json({ progress: { completed: 2, total: 3, percent: 67 } })
    }
    api["GET /store/tenant/courses/course_1/lessons/les_2"] = (() =>
      Response.json({ lesson: { ...lesson, viewed_at: viewed ? "2026-10-08T20:00:00Z" : null } })) as Answer

    const { html, status } = await open("/app/yoga/les_2", { cookie: SIGNED_IN, method: "POST" })
    const post = calls.find((call) => call.init?.method === "POST")

    expect(status).toBe(200)
    expect(viewed).toBe(true)
    expect(new Headers(post?.init?.headers).get("authorization")).toBe("Bearer jwt-buyer")
    expect(html).toContain("Урок пройден")
    expect(html).not.toContain('data-testid="mark-viewed"')
  })

  it("answers 404 for a lesson the course does not have", async () => {
    api["GET /store/tenant/courses/course_1/lessons/les_x"] = new Response("", { status: 404 })

    const { html, status } = await open("/app/yoga/les_x", { cookie: SIGNED_IN })

    expect(status).toBe(404)
    expect(html).toContain("Страница не найдена")
  })
})
