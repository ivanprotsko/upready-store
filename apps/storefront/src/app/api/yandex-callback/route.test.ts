import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * The regression this file holds (t-2026-09-25-01): live runs the standalone
 * server with `HOSTNAME=0.0.0.0 PORT=8000` behind traefik, and there the URL a
 * route handler parses is `https://0.0.0.0:8000/…`, not the address the buyer
 * used. Every redirect of the callback was built on it, so a buyer who had
 * just signed in with Yandex ID landed on `https://0.0.0.0:8000/ru/account`
 * while the session cookie was already set on the shop's own host.
 *
 * Each request below is addressed the way that server sees it (the process'
 * own bind address in the URL) and carries the buyer's address the way traefik
 * hands it over (Host plus `x-forwarded-proto`).
 */

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }))

const BACKEND = "http://backend.test"

const backend = vi.fn<(url: string, init?: RequestInit) => Response>()

const base64url = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url")

/** A state the way the backend signs it: `<payload>.<signature>`. */
const stateFor = (nonce: string) => `${base64url({ n: nonce })}.signature`

/** A Medusa JWT of a returning buyer: the identity already has a customer. */
const jwt = `${base64url({ alg: "HS256" })}.${base64url({
  actor_id: "cus_01",
  actor_type: "customer",
})}.signature`

const callback = async (url: string, headers: Record<string, string>) => {
  const { GET } = await import("./route")
  return GET(new NextRequest(url, { headers }))
}

const liveHeaders = (cookie: string) => ({
  host: "olavka.com",
  "x-forwarded-proto": "https",
  cookie,
})

const sessionCookie = (res: Response) =>
  res.headers.getSetCookie().find((line) => line.startsWith("_medusa_jwt="))

describe("GET /api/yandex-callback", () => {
  beforeEach(() => {
    process.env.MEDUSA_BACKEND_URL = BACKEND
    backend.mockReset()
    backend.mockImplementation((url) => {
      if (url.startsWith(`${BACKEND}/storefront/by-host`)) {
        return new Response("{}", { status: 404 })
      }
      if (url.startsWith(`${BACKEND}/auth/customer/yandex/callback`)) {
        return Response.json({ token: jwt })
      }
      return new Response("{}", { status: 500 })
    })
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) =>
      backend(url, init)
    )
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete process.env.MEDUSA_BACKEND_URL
  })

  it("sends a callback without code and state back to the shop's own address", async () => {
    const res = await callback(
      "http://0.0.0.0:8000/api/yandex-callback",
      liveHeaders("_medusa_locale=ru")
    )

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(
      "https://olavka.com/ru/account?yandex_error=rejected"
    )
  })

  it("reports a denied consent on the shop's own address", async () => {
    const res = await callback(
      "http://0.0.0.0:8000/api/yandex-callback?error=access_denied",
      liveHeaders("_medusa_locale=ru")
    )

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(
      "https://olavka.com/ru/account?yandex_error=denied"
    )
  })

  it("reports a nonce mismatch on the shop's own address", async () => {
    const state = encodeURIComponent(stateFor("nonce-from-another-browser"))
    const res = await callback(
      `http://0.0.0.0:8000/api/yandex-callback?code=c0de&state=${state}`,
      liveHeaders("_medusa_locale=ru; _yandex_nonce=nonce-of-this-browser")
    )

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(
      "https://olavka.com/ru/account?yandex_error=expired"
    )
    expect(backend).not.toHaveBeenCalledWith(
      expect.stringContaining("/auth/customer/yandex/callback"),
      expect.anything()
    )
  })

  it("returns a signed-in buyer to the page they started from, with a Secure session cookie", async () => {
    const state = encodeURIComponent(stateFor("n1"))
    const res = await callback(
      `http://0.0.0.0:8000/api/yandex-callback?code=c0de&state=${state}`,
      liveHeaders(
        "_yandex_nonce=n1; _yandex_return=%2Fru%2Fproducts%2Fliver-cleanse%3Fvariant%3D2"
      )
    )

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(
      "https://olavka.com/ru/products/liver-cleanse?variant=2"
    )
    expect(sessionCookie(res)).toMatch(/^_medusa_jwt=[^;]+;/)
    expect(sessionCookie(res)).toMatch(/;\s*Secure/i)
  })

  it("keeps a plain-http stand on its own host and port, with a cookie that is not Secure", async () => {
    const state = encodeURIComponent(stateFor("n1"))
    const res = await callback(
      `http://0.0.0.0:8273/api/yandex-callback?code=c0de&state=${state}`,
      {
        host: "olavka-com.localhost:8273",
        cookie: "_yandex_nonce=n1; _yandex_return=%2Fru%2Faccount",
      }
    )

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(
      "http://olavka-com.localhost:8273/ru/account"
    )
    expect(sessionCookie(res)).toMatch(/^_medusa_jwt=[^;]+;/)
    expect(sessionCookie(res)).not.toMatch(/;\s*Secure/i)
  })

  it("falls back to the request URL's origin when there is no Host header", async () => {
    const res = await callback("http://0.0.0.0:8000/api/yandex-callback", {
      cookie: "_medusa_locale=ru",
    })

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(
      "http://0.0.0.0:8000/ru/account?yandex_error=rejected"
    )
  })
})
