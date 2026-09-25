import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { NextRequest } from "next/server"

/**
 * `/pricing` (t-2026-09-25-08): the platform's tariff table is served on the
 * platform hosts (`DEMO_HOSTS`) and nowhere else. On a platform host it passes
 * the middleware like `/start` does; on a shop's host it is any other
 * prefix-less path, exactly as before this task.
 */

const BACKEND = "http://backend.test"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

const loadMiddleware = async (demoHosts: string) => {
  vi.resetModules()
  vi.stubEnv("NEXT_PUBLIC_MEDUSA_BACKEND_URL", BACKEND)
  vi.stubEnv("NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY", "pk_test")
  vi.stubEnv("DEMO_HOSTS", demoHosts)

  const { middleware } = await import("./middleware")

  return middleware
}

const get = (url: string) =>
  new NextRequest(url, { headers: { host: new URL(url).host, "accept-language": "ru" } })

/** What a request comes out as: passed through, or redirected and where. */
const outcome = (response: Response) =>
  response.headers.get("location")
    ? { status: response.status, location: response.headers.get("location") }
    : { status: response.status, next: response.headers.get("x-middleware-next") }

describe("middleware: /pricing", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)

        if (url.includes("/storefront/by-host") && url.includes("shop.test")) {
          return json({
            tenant: { id: "ten_1", handle: "shop", name: "Shop" },
            publishable_key: "pk_shop",
            primary_host: "shop.test",
          })
        }
        if (url.includes("/store/regions")) {
          return json({ regions: [{ id: "reg_ru", countries: [{ iso_2: "ru" }] }] })
        }
        return json({}, 404)
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("passes /pricing through on a platform host, like /start", async () => {
    const middleware = await loadMiddleware("start.test")

    expect(outcome(await middleware(get("http://start.test/pricing")))).toEqual({
      status: 200,
      next: "1",
    })
    expect(outcome(await middleware(get("http://start.test/start/pay")))).toEqual({
      status: 200,
      next: "1",
    })
  })

  it("still sends every other path of a platform host to /start", async () => {
    const middleware = await loadMiddleware("start.test")

    for (const path of ["/", "/ru", "/pricing/extra", "/ru/pricing"]) {
      expect(outcome(await middleware(get(`http://start.test${path}`)))).toEqual({
        status: 307,
        location: "http://start.test/start",
      })
    }
  })

  it("treats /pricing on a shop's host as any other prefix-less path", async () => {
    const middleware = await loadMiddleware("start.test")

    const pricing = outcome(await middleware(get("http://shop.test/pricing")))
    const other = outcome(await middleware(get("http://shop.test/some-page")))

    expect(pricing).toEqual({
      status: other.status,
      location: String(other.location).replace("/some-page", "/pricing"),
    })
    expect(pricing.location).toBe("http://shop.test/ru/pricing")
  })

  it("does nothing special for /pricing where no platform host is configured", async () => {
    const middleware = await loadMiddleware("")

    const pricing = outcome(await middleware(get("http://start.test/pricing")))
    const other = outcome(await middleware(get("http://start.test/some-page")))

    expect(pricing).toEqual({
      status: other.status,
      location: String(other.location).replace("/some-page", "/pricing"),
    })
    expect(pricing.location).toBe("http://start.test/ru/pricing")
  })
})
