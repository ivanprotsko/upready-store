import { describe, expect, it, vi } from "vitest"
import { buildLoginUrl, exchangeCode, readCallback } from "./sso"

describe("buildLoginUrl", () => {
  it("sends the buyer to the shop's sign-in with the school's callback and the page to come back to", () => {
    const url = new URL(
      buildLoginUrl({
        shopOrigin: "https://cherkashino.ru",
        schoolOrigin: "https://school.cherkashina.ru",
        next: "/app/yoga/l_1",
      }),
    )

    expect(url.origin).toBe("https://cherkashino.ru")
    expect(url.pathname).toBe("/api/school-sso")
    expect(url.searchParams.get("return_to")).toBe("https://school.cherkashina.ru/auth/callback?next=%2Fapp%2Fyoga%2Fl_1")
  })

  it("never carries a `next` outside the cabinet", () => {
    const url = new URL(
      buildLoginUrl({ shopOrigin: "https://cherkashino.ru", schoolOrigin: "https://school.cherkashina.ru", next: "//evil.example" }),
    )
    const returnTo = new URL(url.searchParams.get("return_to")!)

    expect(returnTo.host).toBe("school.cherkashina.ru")
    expect(returnTo.searchParams.get("next")).toBe("/app")
  })
})

describe("readCallback", () => {
  it("reads the code the shop added as its own parameter", () => {
    expect(readCallback(new URL("https://school.cherkashina.ru/auth/callback?next=%2Fapp%2Fyoga&code=abc"))).toEqual({
      code: "abc",
      next: "/app/yoga",
    })
  })

  it("reads a code glued onto `next` with a second question mark", () => {
    expect(readCallback(new URL("https://school.cherkashina.ru/auth/callback?next=%2Fapp%2Fyoga?code=abc"))).toEqual({
      code: "abc",
      next: "/app/yoga",
    })
  })

  it("has no code and goes home when the address is bare", () => {
    expect(readCallback(new URL("https://school.cherkashina.ru/auth/callback"))).toEqual({ code: null, next: "/app" })
  })
})

describe("exchangeCode", () => {
  const call = (response: Response | Error) => {
    const fetchImpl = vi.fn(async () => {
      if (response instanceof Error) {
        throw response
      }

      return response
    })

    return {
      fetchImpl,
      result: exchangeCode({ apiBase: "http://api.test", publishableKey: "pk_test", code: "abc", fetchImpl }),
    }
  }

  it("posts the code with the shop's key and returns the token", async () => {
    const { fetchImpl, result } = call(Response.json({ token: "jwt-1" }))

    await expect(result).resolves.toEqual({ ok: true, token: "jwt-1" })
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://api.test/store/tenant/sso/exchange",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ code: "abc" }),
        headers: expect.objectContaining({ "x-publishable-api-key": "pk_test" }),
      }),
    )
  })

  it("reads a second exchange of the same code (401) as an expired code", async () => {
    await expect(call(new Response("", { status: 401 })).result).resolves.toEqual({ ok: false, reason: "expired" })
  })

  it("reads a server error, a broken answer and no answer at all as a failure", async () => {
    await expect(call(new Response("", { status: 500 })).result).resolves.toEqual({ ok: false, reason: "failed" })
    await expect(call(Response.json({})).result).resolves.toEqual({ ok: false, reason: "failed" })
    await expect(call(new TypeError("fetch failed")).result).resolves.toEqual({ ok: false, reason: "failed" })
  })
})
