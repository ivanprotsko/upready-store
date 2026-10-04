import { describe, expect, it } from "vitest"

import {
  EMPTY_TENANT_TEST_MODE,
  parseTenantTestModeHeader,
  readTenantTestMode,
  testModeLabel,
} from "./test-mode"

describe("readTenantTestMode", () => {
  it("takes only a literal true as test mode", () => {
    expect(readTenantTestMode({ payments: true, delivery: false })).toEqual({ payments: true, delivery: false })
    expect(readTenantTestMode({ payments: "true", delivery: 1 })).toEqual(EMPTY_TENANT_TEST_MODE)
    expect(readTenantTestMode(null)).toEqual(EMPTY_TENANT_TEST_MODE)
    expect(readTenantTestMode(undefined)).toEqual(EMPTY_TENANT_TEST_MODE)
  })
})

describe("parseTenantTestModeHeader", () => {
  it("parses the middleware's JSON and refuses anything else", () => {
    expect(parseTenantTestModeHeader('{"payments":true,"delivery":true}')).toEqual({ payments: true, delivery: true })
    expect(parseTenantTestModeHeader("not json")).toBeNull()
    expect(parseTenantTestModeHeader(null)).toBeNull()
  })
})

describe("testModeLabel", () => {
  it("says Ivan's A3 wording when both are in test, in Russian", () => {
    expect(testModeLabel({ payments: true, delivery: true }, "ru")).toBe("Включены тестовые оплаты и доставка")
  })

  it("names only what is in test, and speaks English off the Russian locale", () => {
    expect(testModeLabel({ payments: true, delivery: false }, "ru")).toBe("Включены тестовые оплаты")
    expect(testModeLabel({ payments: false, delivery: true }, "ru")).toBe("Включена тестовая доставка")
    expect(testModeLabel({ payments: true, delivery: true }, "en")).toBe("Test payments and test delivery are on")
  })

  it("has no label, so no dot, when nothing is in test", () => {
    expect(testModeLabel(EMPTY_TENANT_TEST_MODE, "ru")).toBeNull()
  })
})
