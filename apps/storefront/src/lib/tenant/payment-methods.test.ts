import { describe, expect, it } from "vitest"

import { EMPTY_TENANT_PAYMENT_METHODS, parseTenantPaymentMethodsHeader } from "./payment-methods"

describe("parseTenantPaymentMethodsHeader", () => {
  it("reads the header the middleware wrote", () => {
    const full = { robokassa: true, manualCrypto: false, manualManager: true, demo: false }
    expect(parseTenantPaymentMethodsHeader(JSON.stringify(full))).toEqual(full)
  })

  it("treats an unparsable header as no header at all", () => {
    expect(parseTenantPaymentMethodsHeader("{not json")).toBeNull()
    expect(parseTenantPaymentMethodsHeader(null)).toBeNull()
    expect(parseTenantPaymentMethodsHeader(undefined)).toBeNull()
  })

  it("degrades a malformed document to EMPTY_TENANT_PAYMENT_METHODS, never a throw", () => {
    expect(parseTenantPaymentMethodsHeader(JSON.stringify("not an object"))).toEqual(
      EMPTY_TENANT_PAYMENT_METHODS
    )
    expect(parseTenantPaymentMethodsHeader(JSON.stringify(null))).toEqual(
      EMPTY_TENANT_PAYMENT_METHODS
    )
  })

  it("fills in a missing demo flag as true, the shop's only way to pay by default", () => {
    expect(parseTenantPaymentMethodsHeader(JSON.stringify({ robokassa: true }))).toEqual({
      robokassa: true,
      manualCrypto: false,
      manualManager: false,
      demo: true,
    })
  })
})
