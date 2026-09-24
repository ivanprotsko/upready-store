import { describe, expect, it } from "vitest"

import {
  allowsEmailLogin,
  allowsYandexLogin,
  EMPTY_LOGIN_SETTINGS,
  parseLoginSettingsHeader,
  yandexLoginAvailable,
} from "./login-settings"

describe("allowsEmailLogin / allowsYandexLogin", () => {
  it("email is allowed for \"email\" and \"both\", never for \"yandex\"", () => {
    expect(allowsEmailLogin("email")).toBe(true)
    expect(allowsEmailLogin("both")).toBe(true)
    expect(allowsEmailLogin("yandex")).toBe(false)
  })

  it("Yandex is allowed for \"yandex\" and \"both\", never for \"email\"", () => {
    expect(allowsYandexLogin("yandex")).toBe(true)
    expect(allowsYandexLogin("both")).toBe(true)
    expect(allowsYandexLogin("email")).toBe(false)
  })
})

describe("yandexLoginAvailable", () => {
  it("needs both the shop's own choice and the platform's keys", () => {
    expect(yandexLoginAvailable({ method: "both", yandex_platform_available: true })).toBe(true)
    expect(yandexLoginAvailable({ method: "yandex", yandex_platform_available: true })).toBe(true)
    // The shop chose Yandex, but this deployment has no keys: still hidden.
    expect(yandexLoginAvailable({ method: "yandex", yandex_platform_available: false })).toBe(false)
    // The platform has keys, but this shop turned Yandex off: still hidden.
    expect(yandexLoginAvailable({ method: "email", yandex_platform_available: true })).toBe(false)
  })
})

describe("parseLoginSettingsHeader", () => {
  it("reads the header the middleware wrote", () => {
    const value = { method: "yandex" as const, yandex_platform_available: true }
    expect(parseLoginSettingsHeader(JSON.stringify(value))).toEqual(value)
  })

  it("treats an unparsable or malformed header as no tenant setting at all", () => {
    expect(parseLoginSettingsHeader("{not json")).toBeNull()
    expect(parseLoginSettingsHeader(null)).toBeNull()
    expect(parseLoginSettingsHeader(undefined)).toBeNull()
    // An unknown method (a stale build reading a newer backend, say) is not
    // trusted halfway — the caller falls back to EMPTY_LOGIN_SETTINGS whole.
    expect(parseLoginSettingsHeader(JSON.stringify({ method: "phone" }))).toBeNull()
  })

  it("defaults yandex_platform_available to false rather than undefined", () => {
    expect(parseLoginSettingsHeader(JSON.stringify({ method: "email" }))).toEqual({
      method: "email",
      yandex_platform_available: false,
    })
  })
})

describe("EMPTY_LOGIN_SETTINGS", () => {
  it("keeps every buyer able to sign in with email — the single-store fallback never disables it", () => {
    expect(allowsEmailLogin(EMPTY_LOGIN_SETTINGS.method)).toBe(true)
  })
})
