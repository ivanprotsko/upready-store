import { describe, expect, it } from "vitest"
import { isStageHeader, readTenantStage, STAGE_X_ROBOTS_TAG } from "./stage"

describe("stage site flag (t-2026-10-27-04)", () => {
  it("is a stage site only on a clear true", () => {
    expect(readTenantStage(true)).toBe(true)
    for (const value of [false, "true", 1, null, undefined, {}]) {
      expect(readTenantStage(value)).toBe(false)
    }
  })

  it("reads the request header the middleware sets", () => {
    expect(isStageHeader("1")).toBe(true)
    expect(isStageHeader(null)).toBe(false)
    expect(isStageHeader("0")).toBe(false)
  })

  it("says noindex and nofollow", () => {
    expect(STAGE_X_ROBOTS_TAG).toBe("noindex, nofollow")
  })
})
