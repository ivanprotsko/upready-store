import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * Leg 1 of the Yandex ID login, addressed the way the standalone server on
 * live sees it (`http://0.0.0.0:8000/…`) with the buyer's address in Host and
 * `x-forwarded-proto`. Its error redirects used to be built on the parsed URL
 * and so named `0.0.0.0:8000` (t-2026-09-25-01); `yandex-callback/route.test.ts`
 * holds the same regression for leg 2.
 */

const BACKEND = "http://backend.test"

const backend = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()

const login = async (url: string, headers: Record<string, string>) => {
  const { GET } = await import("./route")
  return GET(new NextRequest(url, { headers }))
}

const live = { host: "olavka.com", "x-forwarded-proto": "https" }

describe("GET /api/yandex-login", () => {
  beforeEach(() => {
    process.env.MEDUSA_BACKEND_URL = BACKEND
    backend.mockReset()
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      url.startsWith(`${BACKEND}/storefront/by-host`)
        ? Promise.resolve(new Response("{}", { status: 404 }))
        : backend(url, init)
    )
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete process.env.MEDUSA_BACKEND_URL
  })

  it("reports an unconfigured backend on the shop's own address", async () => {
    backend.mockResolvedValue(
      Response.json(
        { message: "Unable to retrieve the auth provider with id: yandex" },
        { status: 500 }
      )
    )

    const res = await login(
      "http://0.0.0.0:8000/api/yandex-login?return=%2Fru%2Faccount",
      live
    )

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(
      "https://olavka.com/ru/account?yandex_error=unconfigured"
    )
  })

  it("reports an unreachable backend on the shop's own address", async () => {
    backend.mockRejectedValue(new TypeError("fetch failed"))

    const res = await login(
      "http://0.0.0.0:8000/api/yandex-login?return=%2Fru%2Faccount",
      live
    )

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(
      "https://olavka.com/ru/account?yandex_error=failed"
    )
  })

  it("sends the buyer to the consent screen with Secure crossing cookies behind a TLS proxy", async () => {
    backend.mockResolvedValue(
      Response.json({
        location: "https://oauth.yandex.ru/authorize?client_id=x",
      })
    )

    const res = await login(
      "http://0.0.0.0:8000/api/yandex-login?return=%2Fru%2Faccount",
      live
    )

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(
      "https://oauth.yandex.ru/authorize?client_id=x"
    )
    const [, init] = backend.mock.calls[0]
    expect(JSON.parse(String(init?.body)).callback_url).toBe(
      "https://olavka.com/api/yandex-callback"
    )
    const crossing = res.headers
      .getSetCookie()
      .filter((line) => /^_yandex_(return|nonce)=/.test(line))
    expect(crossing).toHaveLength(2)
    for (const line of crossing) {
      expect(line).toMatch(/;\s*Secure/i)
    }
  })

  it("falls back to the request URL's origin when there is no Host header", async () => {
    backend.mockResolvedValue(Response.json({}, { status: 500 }))

    const res = await login(
      "http://0.0.0.0:8000/api/yandex-login?return=%2Fru%2Faccount",
      {}
    )

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(
      "http://0.0.0.0:8000/ru/account?yandex_error=unconfigured"
    )
  })
})
