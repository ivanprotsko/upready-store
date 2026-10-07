import { describe, expect, it } from "vitest"

import { EMPTY_TENANT_PAYMENT_METHODS, parseTenantPaymentMethodsHeader } from "./payment-methods"

describe("parseTenantPaymentMethodsHeader", () => {
  it("reads the header the middleware wrote", () => {
    const full = {
      robokassa: true,
      btcpay: false,
      bitcart: true,
      x402: true,
      manualCrypto: false,
      manualManager: true,
      demo: false,
    }
    expect(parseTenantPaymentMethodsHeader(JSON.stringify(full))).toEqual(full)
  })

  // t-2026-10-08-13, part A6: a header written before the gateways travelled reads them as off.
  it("reads a document without the cryptocurrency gateways as a shop that has none", () => {
    const before = { robokassa: true, manualCrypto: false, manualManager: false, demo: false }
    expect(parseTenantPaymentMethodsHeader(JSON.stringify(before))).toEqual({
      ...before,
      btcpay: false,
      bitcart: false,
      x402: false,
    })
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
      btcpay: false,
      bitcart: false,
      x402: false,
      manualCrypto: false,
      manualManager: false,
      demo: true,
    })
  })
})
