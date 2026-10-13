import { renderToString } from "react-dom/server"
import { createStaticHandler, createStaticRouter, Outlet, StaticRouterProvider, type RouteObject } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as appCourse from "./app-course"
import * as appCourses from "./app-courses"
import * as appLayout from "./app-layout"
import * as appLesson from "./app-lesson"
import * as appMedia from "./app-media"
import * as authCallback from "./auth-callback"
import * as login from "./login"
import * as logout from "./logout"
import type { CourseContents } from "~/lib/types"
import { readSetCookie } from "~/test-support/set-cookie"

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
          { id: "routes/app-media", path: "_media", loader: appMedia.loader },
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
    expect(readSetCookie(response?.headers.get("set-cookie"))).toEqual({
      name: "school_jwt",
      value: "jwt-new",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
    })
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
    expect(readSetCookie(response?.headers.get("set-cookie"))).toMatchObject({ name: "school_jwt", value: "", path: "/", maxAge: 0 })
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
    expect(readSetCookie(response?.headers.get("set-cookie"))).toMatchObject({ name: "school_jwt", value: "", path: "/", maxAge: 0 })
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

/**
 * t-2026-10-13-29 stage 2: sections, covers, drip lessons, Telegram, several
 * videos, files and links, against the contract the backend half builds.
 */
const NOW = new Date("2026-10-13T12:00:00Z")

const staged: CourseContents = {
  course: {
    id: "course_2",
    title: "Очищение лимфы",
    slug: "limfa",
    description: null,
    telegram_channel_url: "https://t.me/+channel",
    telegram_chat_url: "https://t.me/+chat",
    access_until: "2027-01-19T00:00:00+03:00",
  },
  lessons: [],
  sections: [
    {
      title: "Подготовка",
      order: 0,
      lessons: [
        {
          id: "lsn_a",
          title: "Режим дня",
          order: 0,
          viewed_at: "2026-10-12T09:00:00Z",
          has_quiz: false,
          section: "Подготовка",
          cover_url: "https://cdn.test/a.jpg",
          summary: "Как принимать гепачисты",
          locked: false,
          opens_at: null,
        },
        { id: "lsn_b", title: "Здоровый сон", order: 1, viewed_at: null, has_quiz: false, section: "Подготовка", cover_url: null, summary: null, locked: false, opens_at: null },
      ],
    },
    {
      title: "Первая неделя программы",
      order: 1,
      lessons: [
        {
          id: "lsn_c",
          title: "Клизмы",
          order: 2,
          viewed_at: null,
          has_quiz: false,
          section: "Первая неделя программы",
          cover_url: null,
          summary: null,
          locked: true,
          opens_at: "2026-10-18T00:00:00+03:00",
        },
      ],
    },
  ],
  progress: { completed: 1, total: 3, percent: 33 },
  continue_lesson_id: "lsn_b",
}
staged.lessons = (staged.sections ?? []).flatMap((section) => section.lessons)

const stagedLesson = {
  id: "lsn_b",
  course_id: "course_2",
  title: "Здоровый сон",
  order: 1,
  body: "Текст урока.",
  video_url: "/store/tenant/courses/course_2/media?key=v1",
  videos: [
    { url: "/store/tenant/courses/course_2/media?key=v1", title: null, duration_sec: 225, poster_url: "https://cdn.test/a.jpg" },
    { url: "/store/tenant/courses/course_2/media?key=v2", title: "Комплекс упражнений", duration_sec: 1287, poster_url: null },
  ],
  attachments: [{ name: "Подготовительный этап.pdf", url: "/store/tenant/courses/course_2/media?key=f1", size_bytes: 1258291, mime: "application/pdf" }],
  links: [
    { kind: "telegram_channel", url: "https://t.me/+channel", title: "Канал «КАМНИ 26 ПОТОКА»" },
    { kind: "youtube", url: "https://www.youtube.com/watch?v=i_UTD2Mh4mI", title: "О вреде молока — YouTube" },
  ],
  quiz: null,
  viewed_at: null,
}

describe("stage 2: /app/<course> with sections", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(NOW)
    api["GET /store/tenant/courses/mine/limfa"] = Response.json(staged)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("heads every section with its title, the lessons under it in order", async () => {
    const { html } = await open("/app/limfa", { cookie: SIGNED_IN })

    expect(html.match(/data-testid="lesson-section"/g)).toHaveLength(2)
    expect(html).toMatch(/<h2[^>]*>Подготовка<\/h2>/)
    expect(html).toMatch(/<h2[^>]*>Первая неделя программы<\/h2>/)
    expect(html.indexOf("Подготовка")).toBeLessThan(html.indexOf("Режим дня"))
    expect(html.indexOf("Здоровый сон")).toBeLessThan(html.indexOf("Первая неделя программы"))
  })

  it("shows a cover only where the lesson has one, and the summary under the title", async () => {
    const { html } = await open("/app/limfa", { cookie: SIGNED_IN })

    expect(html.match(/data-testid="lesson-cover"/g)).toHaveLength(1)
    expect(html).toContain('src="https://cdn.test/a.jpg"')
    expect(html).toContain("Как принимать гепачисты")
  })

  it("lists a locked lesson with its date and no link to it", async () => {
    const { html } = await open("/app/limfa", { cookie: SIGNED_IN })

    expect(html).toContain('data-testid="lesson-locked"')
    expect(html).toContain("Откроется 18 октября")
    expect(html).not.toContain('href="/app/limfa/lsn_c"')
    expect(html).toContain('href="/app/limfa/lsn_b"')
  })

  it("puts the Telegram channel and the stream's chat under the title, and the access date", async () => {
    const { html } = await open("/app/limfa", { cookie: SIGNED_IN })

    expect(html).toMatch(/<a(?=[^>]*href="https:\/\/t\.me\/\+channel")(?=[^>]*data-testid="telegram-channel")[^>]*>Вступить в Telegram-канал<\/a>/)
    expect(html).toMatch(/<a(?=[^>]*href="https:\/\/t\.me\/\+chat")(?=[^>]*data-testid="telegram-chat")[^>]*>Чат потока<\/a>/)
    expect(html.indexOf("course-telegram")).toBeLessThan(html.indexOf("lesson-list"))
    expect(html).toContain("Доступ до 19 января 2027")
  })

  it("shows no Telegram pair, no access line and no section heading for a course without them", async () => {
    api["GET /store/tenant/courses/mine/yoga"] = Response.json(contents)

    const { html } = await open("/app/yoga", { cookie: SIGNED_IN })

    expect(html).not.toContain("course-telegram")
    expect(html).not.toContain("access-until")
    expect(html).not.toMatch(/<h2/)
    expect(html.match(/data-testid="lesson-section"/g)).toHaveLength(1)
  })
})

describe("stage 2: /app/<course>/<lesson>", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(NOW)
    api["GET /store/tenant/courses/mine/limfa"] = Response.json(staged)
    api["GET /store/tenant/courses/course_2/lessons/lsn_b"] = Response.json({ lesson: stagedLesson })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("plays every video in order, each under its own line, through the school's media route", async () => {
    const { html } = await open("/app/limfa/lsn_b", { cookie: SIGNED_IN })
    const sources = [...html.matchAll(/<video[^>]*src="([^"]+)"/g)].map((match) => match[1]?.replaceAll("&amp;", "&"))

    expect(sources).toEqual([
      `/app/_media?src=${encodeURIComponent("/store/tenant/courses/course_2/media?key=v1")}`,
      `/app/_media?src=${encodeURIComponent("/store/tenant/courses/course_2/media?key=v2")}`,
    ])
    expect(html).toContain("Видео 1 из 2 · 3:45")
    expect(html).toContain("Комплекс упражнений · 21:27")
    expect(html).toMatch(/<video(?=[^>]*preload="metadata")(?=[^>]*playsinline="")(?=[^>]*poster="https:\/\/cdn\.test\/a\.jpg")[^>]*>/i)
  })

  it("lists the lesson's files the way the text words a file link", async () => {
    const { html } = await open("/app/limfa/lsn_b", { cookie: SIGNED_IN })

    expect(html).toContain("Файлы урока")
    expect(html).toContain("Скачать «Подготовительный этап.pdf» — PDF, 1,2 МБ")
    expect(html).toContain(`href="/app/_media?src=${encodeURIComponent("/store/tenant/courses/course_2/media?key=f1")}"`)
  })

  it("gives Telegram as a button and YouTube as a plain link with its title, no iframe", async () => {
    const { html } = await open("/app/limfa/lsn_b", { cookie: SIGNED_IN })

    expect(html).toMatch(/<a(?=[^>]*href="https:\/\/t\.me\/\+channel")(?=[^>]*data-testid="lesson-telegram")[^>]*>Канал «КАМНИ 26 ПОТОКА»<\/a>/)
    expect(html).toMatch(/<a(?=[^>]*href="https:\/\/www\.youtube\.com\/watch\?v=i_UTD2Mh4mI")(?=[^>]*data-testid="lesson-link-out")[^>]*>О вреде молока — YouTube<\/a>/)
    expect(html).not.toContain("<iframe")
  })

  it("does not link «Следующий» to a lesson that has not opened", async () => {
    const { html } = await open("/app/limfa/lsn_b", { cookie: SIGNED_IN })

    expect(html).toContain('data-testid="next-lesson-locked"')
    expect(html).toContain("Следующий · откроется 18 октября")
    expect(html).not.toContain('href="/app/limfa/lsn_c"')
  })

  it("shows the lock and the date for a lesson the API answers 403 lesson_locked, not the error view", async () => {
    api["GET /store/tenant/courses/course_2/lessons/lsn_c"] = Response.json(
      { code: "lesson_locked", opens_at: "2026-10-18T00:00:00+03:00" },
      { status: 403 },
    )

    const { html, status } = await open("/app/limfa/lsn_c", { cookie: SIGNED_IN })

    expect(status).toBe(200)
    expect(html).toContain('data-testid="lesson-locked-page"')
    expect(html).toContain("Урок откроется 18 октября")
    expect(html).toMatch(linkTo("/app/limfa", "locked-back"))
    expect(html).toContain("Клизмы")
    expect(html).not.toContain("lesson-videos")
    expect(html).not.toContain("mark-viewed")
    expect(html).not.toContain("Курс пока закрыт")
  })

  it("still shows «Курс пока закрыт» for a 403 that is not a locked lesson", async () => {
    api["GET /store/tenant/courses/course_2/lessons/lsn_b"] = new Response("", { status: 403 })

    const { html, status } = await open("/app/limfa/lsn_b", { cookie: SIGNED_IN })

    expect(status).toBe(403)
    expect(html).toContain("Курс пока закрыт")
  })
})

describe("stage 2: /app/_media", () => {
  it("asks the backend's media route with the buyer's token and passes its redirect on", async () => {
    api["GET /store/tenant/courses/course_2/media"] = new Response(null, {
      status: 302,
      headers: { location: "https://s3.test/courses/t1/limfa/v1.mp4?X-Amz-Signature=s" },
    })
    const src = "/store/tenant/courses/course_2/media?key=v1"

    const { response } = await open(`/app/_media?src=${encodeURIComponent(src)}`, { cookie: SIGNED_IN })

    expect(response?.status).toBe(302)
    expect(response?.headers.get("location")).toBe("https://s3.test/courses/t1/limfa/v1.mp4?X-Amz-Signature=s")
    expect(calls[0]?.url).toBe(`http://api.test${src}`)
    expect(calls[0]?.init?.redirect).toBe("manual")
    expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe("Bearer jwt-buyer")
  })

  it("is no proxy to the rest of the API", async () => {
    // A resource route: the server sends its Response as is, which `open`'s page render does not model.
    const request = new Request(`https://school.cherkashina.ru/app/_media?src=${encodeURIComponent("/store/customers/me")}`, {
      headers: { cookie: SIGNED_IN },
    })
    const response = await appMedia.loader({ request, params: {}, context: {} } as Parameters<typeof appMedia.loader>[0])

    expect(response.status).toBe(404)
    expect(calls).toHaveLength(0)
  })

  it("sends a buyer without the cookie to /login", async () => {
    const src = encodeURIComponent("/store/tenant/courses/course_2/media?key=v1")
    const { response } = await open(`/app/_media?src=${src}`)

    expect(response?.status).toBe(302)
    expect(response?.headers.get("location")).toMatch(/^\/login\?next=/)
  })
})
