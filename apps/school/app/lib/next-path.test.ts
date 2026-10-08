import { describe, expect, it } from "vitest"
import { loginPath, safeNextPath } from "./next-path"
import { mediaUrl, publicApiOrigin } from "./media"
import { clearTokenCookie, readToken, setTokenCookie } from "./session.server"
import { safeNextPath as packageSafeNextPath } from "./vendor/shop-sso"
import { readSetCookie } from "~/test-support/set-cookie"
import { lessonsWord, progressText } from "~/components/progress-bar"
import { scoreQuiz } from "~/components/lesson-quiz"

describe("safeNextPath", () => {
  it.each([
    ["/app", "/app"],
    ["/app/yoga/l_1", "/app/yoga/l_1"],
    ["/app?tab=1", "/app?tab=1"],
  ])("keeps the cabinet's own path %s", (next, expected) => {
    expect(safeNextPath(next)).toBe(expected)
  })

  it.each([null, "", "/", "/application", "//evil.example/app", "https://evil.example/app", "/app\\..\\x", "/app /x", "/login"])(
    "sends %s home",
    (next) => {
      expect(safeNextPath(next)).toBe("/app")
    },
  )

  it.each(["/", "/login", "/application", "/courses/yoga", "/app\\..\\x"])(
    "stays stricter than the package's rule: %s is a local path to the package and home to the cabinet",
    (next) => {
      expect(packageSafeNextPath(next)).toBe(next)
      expect(safeNextPath(next)).toBe("/app")
    },
  )

  it("builds the sign-in address with the page and the reason", () => {
    expect(loginPath("/app/yoga", "expired")).toBe("/login?next=%2Fapp%2Fyoga&error=expired")
  })
})

describe("the school_jwt cookie", () => {
  /** A week, as long as the shop keeps its own `_medusa_jwt`. */
  const WEEK_SECONDS = 7 * 24 * 60 * 60

  it("is httpOnly, Secure, SameSite=Lax, lives a week and is bound to the school's host only", () => {
    expect(readSetCookie(setTokenCookie("jwt-1"))).toEqual({
      name: "school_jwt",
      value: "jwt-1",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: WEEK_SECONDS,
    })
  })

  it("is removed with the same attributes and no age", () => {
    expect(readSetCookie(clearTokenCookie())).toEqual({
      name: "school_jwt",
      value: "",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 0,
    })
  })

  it("is read from the request and nothing else is", () => {
    const request = (cookie: string) => new Request("https://school.test/app", { headers: { cookie } })

    expect(readToken(request("a=1; school_jwt=jwt-1; _medusa_jwt=shop"))).toBe("jwt-1")
    expect(readToken(request("_medusa_jwt=shop"))).toBeNull()
    expect(readToken(request("school_jwt="))).toBeNull()
    expect(readToken(request("school_jwt=%E0%A4%A"))).toBeNull()
  })
})

describe("media addresses", () => {
  it("keeps an absolute picture and resolves a bare path against a public API only", () => {
    expect(mediaUrl("https://cdn.test/a.jpg", null)).toBe("https://cdn.test/a.jpg")
    expect(mediaUrl("/static/a.jpg", publicApiOrigin("https://api.cherkashino.ru"))).toBe(
      "https://api.cherkashino.ru/static/a.jpg",
    )
    expect(mediaUrl("/static/a.jpg", publicApiOrigin("http://mt-backend:9000"))).toBeNull()
    expect(mediaUrl(null, null)).toBeNull()
  })
})

describe("progress words", () => {
  it.each([
    [{ completed: 0, total: 0, percent: 0 }, "Уроков пока нет"],
    [{ completed: 3, total: 10, percent: 30 }, "Пройдено 3 из 10 уроков"],
    [{ completed: 0, total: 1, percent: 0 }, "Пройдено 0 из 1 урока"],
    [{ completed: 21, total: 21, percent: 100 }, "Курс пройден: 21 урок"],
    [{ completed: 4, total: 4, percent: 100 }, "Курс пройден: 4 урока"],
  ])("%o reads «%s»", (progress, text) => {
    expect(progressText(progress)).toBe(text)
  })

  it("declines «урок» by the number", () => {
    expect([1, 2, 5, 11, 12, 22, 25].map((count) => lessonsWord(count))).toEqual([
      "урок",
      "урока",
      "уроков",
      "уроков",
      "уроков",
      "урока",
      "уроков",
    ])
  })
})

describe("scoreQuiz", () => {
  it("counts right answers, an unanswered question as wrong", () => {
    const quiz = {
      questions: [
        { text: "a", options: ["x", "y"], correct: 1 },
        { text: "b", options: ["x", "y"], correct: 0 },
      ],
    }

    expect(scoreQuiz(quiz, [1, 0])).toBe(2)
    expect(scoreQuiz(quiz, [1, null])).toBe(1)
  })
})
