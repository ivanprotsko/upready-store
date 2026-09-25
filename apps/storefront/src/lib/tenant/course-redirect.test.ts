import { afterEach, describe, expect, it, vi } from "vitest"

import { isAppLocale } from "@i18n/config"

import { matchCourseSlugPath, resolveCourseProductHandle } from "./course-redirect"

describe("matchCourseSlugPath", () => {
  it("matches a bare /course-<slug>, no locale in the path", () => {
    expect(matchCourseSlugPath(["course-superkurs"], isAppLocale)).toEqual({
      locale: null,
      slug: "superkurs",
    })
  })

  it("matches /<locale>/course-<slug>", () => {
    expect(matchCourseSlugPath(["ru", "course-superkurs"], isAppLocale)).toEqual({
      locale: "ru",
      slug: "superkurs",
    })
  })

  it("keeps a hyphenated slug whole", () => {
    expect(matchCourseSlugPath(["course-ochishenie-pecheni"], isAppLocale)).toEqual({
      locale: null,
      slug: "ochishenie-pecheni",
    })
  })

  it("does not match a real product address", () => {
    expect(matchCourseSlugPath(["products", "some-handle"], isAppLocale)).toBeNull()
  })

  it("does not match a first segment that merely starts with course- but has no locale ahead of it", () => {
    expect(matchCourseSlugPath(["xx", "course-superkurs"], isAppLocale)).toBeNull()
  })

  it("does not match a course path with extra segments after it", () => {
    expect(
      matchCourseSlugPath(["course-superkurs", "lessons", "l1"], isAppLocale)
    ).toBeNull()
  })

  it("does not match the empty path or an unrelated single segment", () => {
    expect(matchCourseSlugPath([], isAppLocale)).toBeNull()
    expect(matchCourseSlugPath(["about"], isAppLocale)).toBeNull()
  })
})

describe("resolveCourseProductHandle", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("answers null with no publishable key, no fetch attempted", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    expect(await resolveCourseProductHandle("http://backend.test", null, "superkurs")).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("reads the product handle from a 200, tenant-scoped by the publishable key header", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("http://backend.test/store/tenant/courses/by-slug/superkurs")
      expect((init?.headers as Record<string, string>)["x-publishable-api-key"]).toBe("pk_test")
      return new Response(JSON.stringify({ product_handle: "liver-cleanse" }), { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    expect(
      await resolveCourseProductHandle("http://backend.test", "pk_test", "superkurs")
    ).toBe("liver-cleanse")
  })

  it("answers null for a 404 (unknown or another tenant's slug), not a throw", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 }))
    )

    expect(
      await resolveCourseProductHandle("http://backend.test", "pk_test", "does-not-exist")
    ).toBeNull()
  })

  it("answers null on a network failure, not a throw", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED")
      })
    )

    expect(
      await resolveCourseProductHandle("http://backend.test", "pk_test", "superkurs")
    ).toBeNull()
  })

  it("percent-encodes the slug in the request path", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("http://backend.test/store/tenant/courses/by-slug/a%2Fb")
      return new Response(JSON.stringify({ product_handle: "x" }), { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    await resolveCourseProductHandle("http://backend.test", "pk_test", "a/b")
  })
})
