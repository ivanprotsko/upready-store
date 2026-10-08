import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { sanitizeReturnPath } from "@lib/util/return-path"

/**
 * t-2026-10-08-36, part B: the shop's half of the school's sign-in, addressed
 * the way the standalone server on live sees it (`http://0.0.0.0:8000/…`) with
 * the buyer's address in Host and `x-forwarded-proto`.
 */

const BACKEND = "http://backend.test"
const CALLBACK = "https://school.cherkashina.ru/auth/callback?next=%2Fcourses%2Fyoga"
const SELF = `/api/school-sso?${new URLSearchParams({ return_to: CALLBACK })}`

const backend = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()

const live = { host: "cherkashino.ru", "x-forwarded-proto": "https" }

const visit = async (
  query: Record<string, string>,
  headers: Record<string, string> = live
) => {
  const { GET } = await import("./route")
  return GET(
    new NextRequest(
      `http://0.0.0.0:8000/api/school-sso?${new URLSearchParams(query)}`,
      { headers }
    )
  )
}

const signedIn = { ...live, cookie: "_medusa_jwt=buyer-token; _medusa_locale=ru" }

describe("GET /api/school-sso", () => {
  beforeEach(() => {
    process.env.MEDUSA_BACKEND_URL = BACKEND
    process.env.SCHOOL_SSO_RETURN_HOSTS = "school.cherkashina.ru"
    backend.mockReset()
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      url.startsWith(`${BACKEND}/storefront/by-host`)
        ? Promise.resolve(
            Response.json({
              tenant: { handle: "olavka", name: "Olavka" },
              publishable_key: "pk_olavka",
            })
          )
        : backend(url, init)
    )
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete process.env.MEDUSA_BACKEND_URL
    delete process.env.SCHOOL_SSO_RETURN_HOSTS
  })

  it.each([
    ["a host outside the list", "https://evil.example/auth/callback"],
    ["plain http", "http://school.cherkashina.ru/auth/callback"],
    ["a relative path", "/auth/callback"],
  ])("answers 400 to %s and asks the backend nothing", async (_label, returnTo) => {
    const res = await visit({ return_to: returnTo }, signedIn)

    expect(res.status).toBe(400)
    expect(backend).not.toHaveBeenCalled()
  })

  it("answers 400 to every address while the list is empty", async () => {
    process.env.SCHOOL_SSO_RETURN_HOSTS = ""

    const res = await visit({ return_to: CALLBACK }, signedIn)

    expect(res.status).toBe(400)
  })

  it("sends a buyer without a session to the Yandex sign-in, coming back here", async () => {
    const res = await visit({ return_to: CALLBACK })

    expect(res.status).toBe(307)
    const location = new URL(res.headers.get("location")!)
    expect(location.origin + location.pathname).toBe(
      "https://cherkashino.ru/api/yandex-login"
    )
    expect(location.searchParams.get("return")).toBe(SELF)
    expect(backend).not.toHaveBeenCalled()
  })

  it("keeps the way back intact through yandex-login's own return check", () => {
    // `/api/yandex-login` and `/api/yandex-callback` run `return` through
    // `sanitizeReturnPath`; the school's own `?next=` inside `return_to` has
    // to come out the other side unchanged.
    const kept = sanitizeReturnPath(SELF)

    expect(kept).toBe(SELF)
    expect(
      new URLSearchParams(kept.split("?")[1]).get("return_to")
    ).toBe(CALLBACK)
  })

  it("sends a failed sign-in to the shop's login page, not round again", async () => {
    const res = await visit({ return_to: CALLBACK, yandex_error: "unconfigured" }, {
      ...live,
      cookie: "_medusa_locale=ru",
    })

    expect(res.status).toBe(307)
    const location = new URL(res.headers.get("location")!)
    expect(location.origin + location.pathname).toBe(
      "https://cherkashino.ru/ru/account"
    )
    expect(location.searchParams.get("return")).toBe(SELF)
    expect(location.searchParams.get("yandex_error")).toBe("unconfigured")
  })

  it("sends a signed-in buyer on to the school with a code", async () => {
    backend.mockResolvedValue(Response.json({ code: "c0de" }))

    const res = await visit({ return_to: CALLBACK }, signedIn)

    expect(res.status).toBe(307)
    const location = new URL(res.headers.get("location")!)
    expect(location.origin + location.pathname).toBe(
      "https://school.cherkashina.ru/auth/callback"
    )
    expect(location.searchParams.get("next")).toBe("/courses/yoga")
    expect(location.searchParams.get("code")).toBe("c0de")
    expect(res.headers.get("cache-control")).toBe("no-store")

    const [url, init] = backend.mock.calls[0]
    expect(url).toBe(`${BACKEND}/store/tenant/sso/code`)
    const headers = init?.headers as Record<string, string>
    expect(headers.Authorization).toBe("Bearer buyer-token")
    expect(headers["x-publishable-api-key"]).toBe("pk_olavka")
    expect(JSON.parse(String(init?.body))).toEqual({ return_to: CALLBACK })
    // The shop's own session is read, never rewritten.
    expect(res.headers.getSetCookie()).toEqual([])
  })

  it("treats an expired session as none", async () => {
    backend.mockResolvedValue(Response.json({ message: "Unauthorized" }, { status: 401 }))

    const res = await visit({ return_to: CALLBACK }, signedIn)

    expect(res.status).toBe(307)
    expect(new URL(res.headers.get("location")!).pathname).toBe("/api/yandex-login")
  })

  it("answers 502 when the backend mints no code", async () => {
    backend.mockResolvedValue(Response.json({ message: "boom" }, { status: 500 }))

    const res = await visit({ return_to: CALLBACK }, signedIn)

    expect(res.status).toBe(502)
  })

  it("answers 502 when the backend is unreachable", async () => {
    backend.mockRejectedValue(new TypeError("fetch failed"))

    const res = await visit({ return_to: CALLBACK }, signedIn)

    expect(res.status).toBe(502)
  })
})
