import { beforeEach, describe, expect, it, vi } from "vitest"

/** t-2026-10-27-04: a stage site's robots.txt closes everything; a live shop's is unchanged. */

const state = { stage: false }

vi.mock("@lib/data/cookies", () => ({ getRequestBaseURL: async () => "https://shop.example" }))
vi.mock("@lib/data/tenant-stage", () => ({ isStageSite: async () => state.stage }))

describe("robots.txt", () => {
  beforeEach(() => {
    state.stage = false
  })

  it("disallows everything on a stage site, with no sitemap", async () => {
    state.stage = true
    const { default: robots } = await import("./robots")

    const answer = await robots()

    expect(answer.rules).toEqual([{ userAgent: "*", disallow: "/" }])
    expect(answer.sitemap).toBeUndefined()
  })

  it("keeps a live shop's rules and sitemap", async () => {
    const { default: robots } = await import("./robots")

    const answer = await robots()

    expect(answer.sitemap).toBe("https://shop.example/sitemap.xml")
    expect(JSON.stringify(answer.rules)).toContain('"allow":"/"')
  })
})
