import { describe, expect, it } from "vitest"

import { parseTenantPromoCodeHeader, readTenantPromoCode } from "./promo-code"

describe("readTenantPromoCode", () => {
  it("takes the field away only on a literal false", () => {
    expect(readTenantPromoCode({ enabled: false })).toBe(false)
    expect(readTenantPromoCode({ enabled: true })).toBe(true)
    expect(readTenantPromoCode({ enabled: "false" })).toBe(true)
    expect(readTenantPromoCode({})).toBe(true)
    expect(readTenantPromoCode(null)).toBe(true)
    expect(readTenantPromoCode(undefined)).toBe(true)
  })
})

describe("parseTenantPromoCodeHeader", () => {
  it("parses the middleware's JSON and keeps the field on anything else", () => {
    expect(parseTenantPromoCodeHeader('{"enabled":false}')).toBe(false)
    expect(parseTenantPromoCodeHeader('{"enabled":true}')).toBe(true)
    expect(parseTenantPromoCodeHeader("not json")).toBe(true)
    expect(parseTenantPromoCodeHeader(null)).toBe(true)
  })
})
