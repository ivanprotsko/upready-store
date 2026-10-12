import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { NextRequest } from "next/server"

/**
 * t-2026-10-12-32 FX4 (audit 13.10, D4): an address no shop lives at. The
 * backend answers `/storefront/by-host` 404 "No storefront is configured for
 * host", and the multi-shop storefront (no NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
 * `deploy/compose.mt.yml`) used to send such a host `/` → 302 `/ru` → 200 with
 * an empty shop under the build profile's name. Now every page of it is
 * rewritten to `/shop-not-found`, whose page answers 404
 * (`app/shop-not-found/page.test.tsx`) — never a redirect into `[locale]`,
 * never a 5xx.
 *
 * What must NOT change: a known shop, a single-store deployment with its own
 * key, and a backend that failed to answer (500, unreachable) — "do not know"
 * is not "no shop".
 */

const BACKEND = "http://backend.test"
const UNKNOWN = "nosuchshop-t32.shipshift.dev"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

/** How the backend answers by-host for a host: a shop, its own 404, a 500, or no answer at all. */
let byHost: (host: string) => Response | "unreachable"

const backendAnswer = (host: string): Response | "unreachable" =>
  host === "shop.test"
    ? json({
        tenant: { id: "ten_1", handle: "shop", name: "Shop" },
        publishable_key: "pk_shop",
        primary_host: "shop.test",
      })
    : json({ type: "not_found", message: `No storefront is configured for host "${host}".` }, 404)

const loadMiddleware = async (fallbackKey = "") => {
  vi.resetModules()
  vi.stubEnv("NEXT_PUBLIC_MEDUSA_BACKEND_URL", BACKEND)
  vi.stubEnv("NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY", fallbackKey)
  vi.stubEnv("DEMO_HOSTS", "")

  const { middleware } = await import("./middleware")

  return middleware
}

const get = (url: string, headers: Record<string, string> = {}) =>
  new NextRequest(url, {
    headers: { host: new URL(url).host, "accept-language": "ru", ...headers },
  })

const rewriteOf = (response: Response) => {
  const target = response.headers.get("x-middleware-rewrite")
  return target ? new URL(target).pathname : null
}

describe("middleware: a host with no shop behind it", () => {
  beforeEach(() => {
    byHost = backendAnswer
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input))

        if (url.pathname === "/storefront/by-host") {
          const answer = byHost(url.searchParams.get("host") ?? "")
          if (answer === "unreachable") {
            throw new TypeError("fetch failed")
          }
          return answer
        }
        if (url.pathname === "/store/regions") {
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

  it("rewrites every page of an unknown host to /shop-not-found, no redirect into [locale], noindex", async () => {
    const middleware = await loadMiddleware()

    for (const path of ["/", "/ru", "/en/store", "/products/anything"]) {
      const response = await middleware(get(`https://${UNKNOWN}${path}`))

      expect(rewriteOf(response), path).toBe("/shop-not-found")
      expect(response.headers.get("location"), path).toBeNull()
      expect(response.status, path).toBeLessThan(500)
      expect(response.headers.get("x-robots-tag"), path).toBe("noindex")
    }
  })

  it("draws it in the platform's Geist look, with no shop's headers", async () => {
    const middleware = await loadMiddleware()

    const response = await middleware(
      get(`https://${UNKNOWN}/`, { "x-tenant-handle": "forged", "x-tenant-key": "pk_forged" })
    )

    expect(response.headers.get("x-middleware-request-x-tenant-theme")).toBe("geist")
    expect(response.headers.get("x-middleware-request-x-tenant-handle")).toBeNull()
    expect(response.headers.get("x-middleware-request-x-tenant-key")).toBeNull()
  })

  it("answers a file path of an unknown host with a bare 404", async () => {
    const middleware = await loadMiddleware()

    const response = await middleware(get(`https://${UNKNOWN}/favicon.ico`))

    expect(response.status).toBe(404)
    expect(rewriteOf(response)).toBeNull()
  })

  it("leaves a known shop alone", async () => {
    const middleware = await loadMiddleware()

    const response = await middleware(get("https://shop.test/ru/store"))

    expect(rewriteOf(response)).toBeNull()
    expect(response.headers.get("x-middleware-next")).toBe("1")
  })

  it("leaves a single-store deployment alone: its own key serves any host", async () => {
    const middleware = await loadMiddleware("pk_single_store")

    const response = await middleware(get(`https://${UNKNOWN}/`))

    expect(rewriteOf(response)).toBeNull()
    expect(response.status).toBe(302)
  })

  it("does not call a host shopless when the backend answered 500 or not at all", async () => {
    for (const failure of [json({ message: "boom" }, 500), "unreachable" as const]) {
      byHost = () => failure
      const middleware = await loadMiddleware()

      const response = await middleware(get(`https://${UNKNOWN}/`))

      expect(rewriteOf(response)).toBeNull()
      expect(response.status).toBe(302)
    }
  })

  it("lets the Server Action self-fetch reach its shop through the forwarded name", async () => {
    const middleware = await loadMiddleware()

    const response = await middleware(
      get("http://localhost:8000/ru/order/order_1/confirmed", { "x-forwarded-host": "shop.test" })
    )

    expect(rewriteOf(response)).toBeNull()
    expect(response.headers.get("x-middleware-request-x-tenant-handle")).toBe("shop")
  })

  it("is shopless only when every address the request named is", async () => {
    byHost = (host) => (host === UNKNOWN ? json({ message: "boom" }, 500) : backendAnswer(host))
    const middleware = await loadMiddleware()

    const response = await middleware(get("http://localhost:8000/ru", { "x-forwarded-host": UNKNOWN }))

    expect(rewriteOf(response)).toBeNull()
  })
})
