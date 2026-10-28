import { afterEach, describe, expect, it, vi } from "vitest"

import { NextRequest } from "next/server"

/**
 * t-2026-10-27-04: a stage site answers every response with `X-Robots-Tag`,
 * redirects included; its main site never does.
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
  vi.stubEnv("NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY", "")
  vi.stubEnv("DEMO_HOSTS", "")

  const { middleware } = await import("./middleware")

  return middleware
}

const stubBackend = (stage: boolean | undefined, host: string) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes("/storefront/by-host")) {
        return json({
          tenant: { id: "tenant_1", handle: "shop", name: "Shop" },
          primary_host: host,
          publishable_key: "pk_shop",
          ...(stage === undefined ? {} : { stage }),
        })
      }
      if (url.includes("/store/regions")) {
        return json({ regions: [{ id: "reg_ru", countries: [{ iso_2: "ru" }] }] })
      }
      return json({}, 404)
    })
  )
}

const page = (host: string, path = "/ru/store") =>
  new NextRequest(`http://${host}${path}`, { headers: { host, "accept-language": "ru" } })

describe("stage site noindex header", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("marks a stage site's page with X-Robots-Tag: noindex, nofollow", async () => {
    stubBackend(true, "stage.shop.test")
    const middleware = await loadMiddleware()

    const response = await middleware(page("stage.shop.test"))

    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow")
  })

  it("marks a stage site's redirect too", async () => {
    stubBackend(true, "stage.shop.test")
    const middleware = await loadMiddleware()

    const response = await middleware(page("stage.shop.test", "/store"))

    expect(response.status).toBe(302)
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow")
  })

  it("leaves the main site's page without it", async () => {
    stubBackend(false, "shop.test")
    const middleware = await loadMiddleware()

    const response = await middleware(page("shop.test"))

    expect(response.headers.get("x-robots-tag")).toBeNull()
  })

  it("reads a backend that sends no stage field as a live shop", async () => {
    stubBackend(undefined, "shop.test")
    const middleware = await loadMiddleware()

    const response = await middleware(page("shop.test"))

    expect(response.headers.get("x-robots-tag")).toBeNull()
  })
})
