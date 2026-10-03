import { describe, expect, it } from "vitest"

import {
  TENANT_HEADERS,
  decodeTenantHeaderValue,
  encodeTenantHeaderValue,
} from "./headers"

/**
 * The regression these cover is not "the name is missing" — it is a 500 on every path of
 * a shop. `Headers.set()` throws on a code point above U+00FF, and in Next's middleware
 * that throw takes the request with it. Measured 2026-09-12 on
 * https://nochlavka.shipshift.dev (a shop created through the onboarding wizard and named
 * «Ночная лавка»): HTTP 500, `TypeError: Cannot convert argument to a ByteString … value
 * of 1053` in mt-storefront's log.
 */
describe("tenant header values", () => {
  it("survives a Headers round trip for a name written in Cyrillic", () => {
    const name = "Ночная лавка"
    const headers = new Headers()

    expect(() => headers.set("x-tenant-name", encodeTenantHeaderValue(name))).not.toThrow()
    expect(decodeTenantHeaderValue(headers.get("x-tenant-name"))).toBe(name)
  })

  it("leaves every ASCII value byte for byte", () => {
    for (const value of [
      "pk_96aa8703cf476f23b0760e10074c630ad5eefea3cb849cfa76368b2ba2d802a6",
      "nochlavka",
      "sneakers",
      "dark",
    ]) {
      expect(encodeTenantHeaderValue(value)).toBe(value)
      expect(decodeTenantHeaderValue(value)).toBe(value)
    }
  })

  it("round-trips the other scripts a shop may name itself in", () => {
    for (const name of ["日本の店", "Ötzi & Söhne", "متجر", "Café — 100%"]) {
      const headers = new Headers()
      headers.set("x-tenant-name", encodeTenantHeaderValue(name))
      expect(decodeTenantHeaderValue(headers.get("x-tenant-name"))).toBe(name)
    }
  })

  it("hands back a malformed value instead of throwing", () => {
    expect(decodeTenantHeaderValue("%E0%A4%A")).toBe("%E0%A4%A")
    expect(decodeTenantHeaderValue(null)).toBeNull()
    expect(decodeTenantHeaderValue(undefined)).toBeNull()
  })

  it("names every header the middleware writes, so none is encoded by accident only", () => {
    expect([...TENANT_HEADERS]).toEqual([
      "x-tenant-key",
      "x-tenant-handle",
      "x-tenant-name",
      "x-tenant-theme",
      "x-tenant-mode",
      "x-tenant-origin",
      "x-tenant-attribution",
      "x-tenant-locales",
      "x-tenant-default-locale",
      "x-tenant-seo-verification",
      "x-tenant-analytics",
      "x-tenant-branding",
      "x-tenant-login",
      "x-tenant-manual-payment",
      "x-tenant-payment-methods",
      "x-tenant-payment-pre-notice",
    ])
  })
})
