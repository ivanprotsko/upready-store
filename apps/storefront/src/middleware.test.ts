import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { NextRequest } from "next/server"

/**
 * The regression this file holds: a Server Action POST carries the URL of the
 * page it was submitted from, so the country and the locale the middleware
 * derives for it are the OLD ones. The middleware wrote both as cookies on that
 * response, next to the cookies the action had just set, and the visitor who
 * switched country and language together landed back on the old pair
 * (`t-port-stale-cart-fix`, ported from cherkashino-store `aeffa62`).
 */

const BACKEND = "http://backend.test"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

const loadMiddleware = async () => {
  vi.resetModules()
  vi.stubEnv("NEXT_PUBLIC_MEDUSA_BACKEND_URL", BACKEND)
  vi.stubEnv("NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY", "pk_test")
  vi.stubEnv("DEMO_HOSTS", "")

  const { middleware } = await import("./middleware")

  return middleware
}

const setCookieNames = (response: Response) =>
  response.headers.getSetCookie().map((cookie) => cookie.split("=")[0])

describe("middleware cookies", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)

        if (url.includes("/store/regions")) {
          return json({
            regions: [
              { id: "reg_ru", countries: [{ iso_2: "ru" }] },
              { id: "reg_de", countries: [{ iso_2: "de" }] },
            ],
          })
        }

        // No tenant behind the host and no redirect rows: single-store mode.
        return json({}, 404)
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  const request = (headers: Record<string, string> = {}) =>
    new NextRequest("http://shop.test/ru/store", {
      method: headers["next-action"] ? "POST" : "GET",
      headers: {
        host: "shop.test",
        cookie: "_medusa_country=ru; _medusa_cache_id=cache_1",
        ...headers,
      },
    })

  it("writes the country and the locale of the URL on a page request", async () => {
    const middleware = await loadMiddleware()

    const response = await middleware(request())

    expect(setCookieNames(response)).toEqual(
      expect.arrayContaining(["_medusa_country", "_medusa_locale"])
    )
  })

  it("writes neither on a Server Action POST, whose URL is the page left behind", async () => {
    const middleware = await loadMiddleware()

    const response = await middleware(request({ "next-action": "abc123" }))

    expect(setCookieNames(response)).not.toContain("_medusa_country")
    expect(setCookieNames(response)).not.toContain("_medusa_locale")
  })
})
