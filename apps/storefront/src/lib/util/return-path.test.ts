import { describe, expect, it } from "vitest"
import { isLocalReturnPath, sanitizeAccountReturnPath, sanitizeReturnPath } from "./return-path"

/**
 * t-2026-10-01-checkout-ivan-3: the password login/sign-up redirect from cart
 * and checkout reuses the same rule the Yandex ID flow already applied to its
 * own `?return=`, so a hostile value cannot turn either entry point into an
 * open redirect.
 */
describe("isLocalReturnPath", () => {
  it("accepts a local path", () => {
    expect(isLocalReturnPath("/ru/checkout")).toBe(true)
    expect(isLocalReturnPath("/ru/cart?step=address")).toBe(true)
  })

  it("rejects a protocol-relative path", () => {
    expect(isLocalReturnPath("//evil.com")).toBe(false)
  })

  it("rejects an absolute URL with any scheme", () => {
    expect(isLocalReturnPath("https://evil.com/ru/account")).toBe(false)
    expect(isLocalReturnPath("http://evil.com")).toBe(false)
  })

  it("rejects a backslash-disguised host", () => {
    expect(isLocalReturnPath("/\\evil.com")).toBe(false)
    expect(isLocalReturnPath("/\\/evil.com")).toBe(false)
  })

  it("rejects javascript:", () => {
    expect(isLocalReturnPath("javascript:alert(1)")).toBe(false)
  })

  it("rejects empty, missing or non-absolute input", () => {
    expect(isLocalReturnPath("")).toBe(false)
    expect(isLocalReturnPath(null)).toBe(false)
    expect(isLocalReturnPath(undefined)).toBe(false)
    expect(isLocalReturnPath("ru/checkout")).toBe(false)
  })
})

describe("sanitizeReturnPath", () => {
  it("passes a valid local path through, stripping a stale yandex_error", () => {
    expect(sanitizeReturnPath("/ru/checkout")).toBe("/ru/checkout")
    expect(sanitizeReturnPath("/ru/account?yandex_error=failed")).toBe(
      "/ru/account"
    )
    expect(
      sanitizeReturnPath("/ru/account?foo=bar&yandex_error=failed")
    ).toBe("/ru/account?foo=bar")
  })

  it("falls back to / on anything hostile", () => {
    expect(sanitizeReturnPath("//evil.com")).toBe("/")
    expect(sanitizeReturnPath("https://evil.com")).toBe("/")
    expect(sanitizeReturnPath("/\\evil.com")).toBe("/")
    expect(sanitizeReturnPath(null)).toBe("/")
  })
})

describe("sanitizeAccountReturnPath", () => {
  it("passes a valid local path through", () => {
    expect(sanitizeAccountReturnPath("/ru/checkout", "ru")).toBe(
      "/ru/checkout"
    )
  })

  it("falls back to the locale's account page on anything hostile", () => {
    expect(sanitizeAccountReturnPath("//evil.com", "ru")).toBe("/ru/account")
    expect(sanitizeAccountReturnPath("https://evil.com", "ru")).toBe(
      "/ru/account"
    )
    expect(sanitizeAccountReturnPath("/\\evil.com", "ru")).toBe("/ru/account")
    expect(sanitizeAccountReturnPath("javascript:alert(1)", "en")).toBe(
      "/en/account"
    )
    expect(sanitizeAccountReturnPath(null, "ru")).toBe("/ru/account")
  })
})
