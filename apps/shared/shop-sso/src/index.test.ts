import { describe, expect, it, vi } from "vitest"

import {
  buildLoginUrl,
  clearSchoolJwtCookie,
  exchangeCode,
  readSchoolJwt,
  safeNextPath,
  SCHOOL_JWT_COOKIE,
  schoolJwtCookieOptions,
  serializeSchoolJwtCookie,
  shopApiHeaders,
  ShopSsoError,
} from "./index"

const SHOP = "https://cherkashino.ru"
const SCHOOL = "https://school.cherkashina.ru"

describe("buildLoginUrl", () => {
  it("points at the shop's /api/school-sso with the callback and next in return_to", () => {
    const url = new URL(buildLoginUrl({ shopOrigin: SHOP, schoolOrigin: SCHOOL, next: "/courses/yoga?tab=2" }))

    expect(url.origin + url.pathname).toBe("https://cherkashino.ru/api/school-sso")
    const returnTo = new URL(url.searchParams.get("return_to")!)
    expect(returnTo.origin + returnTo.pathname).toBe("https://school.cherkashina.ru/auth/callback")
    expect(returnTo.searchParams.get("next")).toBe("/courses/yoga?tab=2")
  })

  it("takes another callback path", () => {
    const url = new URL(
      buildLoginUrl({ shopOrigin: SHOP, schoolOrigin: SCHOOL, callbackPath: "/sso/back" })
    )

    expect(new URL(url.searchParams.get("return_to")!).pathname).toBe("/sso/back")
  })

  it.each([
    ["another site", "https://evil.example/x"],
    ["a protocol-relative path", "//evil.example/x"],
    ["a backslash-disguised host", "/\\evil.example"],
    ["a tab smuggled in", "/\t/evil.example"],
    ["nothing", null],
  ])("lands on / instead of %s", (_label, next) => {
    const url = new URL(buildLoginUrl({ shopOrigin: SHOP, schoolOrigin: SCHOOL, next }))

    expect(new URL(url.searchParams.get("return_to")!).searchParams.get("next")).toBe("/")
    expect(safeNextPath(next)).toBe("/")
  })
})

describe("exchangeCode", () => {
  it("posts the code with the shop's key and returns the token", async () => {
    const fetch = vi.fn(async () => Response.json({ token: "jwt" }))

    const result = await exchangeCode({
      backendUrl: "http://backend.test/",
      publishableKey: "pk_olavka",
      code: "c0de",
      fetch,
    })

    expect(result).toEqual({ token: "jwt" })
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("http://backend.test/store/tenant/sso/exchange")
    expect(init.method).toBe("POST")
    expect((init.headers as Record<string, string>)["x-publishable-api-key"]).toBe("pk_olavka")
    expect(JSON.parse(String(init.body))).toEqual({ code: "c0de" })
  })

  it("throws 401 when the shop refuses the code", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ message: "The code is unknown, expired or already used." }, { status: 401 })
    )

    await expect(
      exchangeCode({ backendUrl: "http://backend.test", publishableKey: "pk", code: "used", fetch })
    ).rejects.toMatchObject({ name: "ShopSsoError", status: 401 })
  })

  it("throws 400 without asking the shop when there is no code", async () => {
    const fetch = vi.fn()

    await expect(
      exchangeCode({ backendUrl: "http://backend.test", publishableKey: "pk", code: "", fetch })
    ).rejects.toBeInstanceOf(ShopSsoError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it("throws status 0 when the shop is unreachable", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("fetch failed")
    })

    await expect(
      exchangeCode({ backendUrl: "http://backend.test", publishableKey: "pk", code: "c", fetch })
    ).rejects.toMatchObject({ status: 0 })
  })
})

describe("school_jwt", () => {
  it("is host-only, httpOnly, Secure and Lax", () => {
    const line = serializeSchoolJwtCookie("a.b.c")

    expect(line).toBe("school_jwt=a.b.c; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax")
    expect(line).not.toMatch(/Domain=/i)
    expect(schoolJwtCookieOptions).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 604800,
    })
  })

  it("is cleared alone on sign-out", () => {
    expect(clearSchoolJwtCookie()).toBe("school_jwt=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax")
  })

  it("is read back from a Cookie header", () => {
    expect(readSchoolJwt(`_medusa_jwt=shop; ${SCHOOL_JWT_COOKIE}=a.b.c; other=1`)).toBe("a.b.c")
    expect(readSchoolJwt("_medusa_jwt=shop")).toBeNull()
    expect(readSchoolJwt(undefined)).toBeNull()
  })

  it("rides every call to the shop's API with the shop's key", () => {
    expect(shopApiHeaders({ token: "a.b.c", publishableKey: "pk_olavka" })).toEqual({
      Authorization: "Bearer a.b.c",
      "x-publishable-api-key": "pk_olavka",
    })
  })
})
