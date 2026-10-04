import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * o25-login-methods: the login/register screens render only the methods this
 * shop chose. `Login`, `LoginTemplate` and `YandexLoginError` are client components
 * this suite has no renderer for (no @testing-library/react in this package,
 * the same constraint every `readFileSync`-based test here already works
 * around — see `src/lib/theme/composition.test.ts`), so the gating is
 * asserted on the source directly: which JSX block a condition wraps.
 */

const here = dirname(fileURLToPath(import.meta.url))
const loginSource = readFileSync(join(here, "index.tsx"), "utf8")
const templateSource = readFileSync(
  join(here, "..", "..", "templates", "login-template.tsx"),
  "utf8"
)
const yandexSource = readFileSync(
  join(here, "..", "yandex-login", "index.tsx"),
  "utf8"
)

const methodsSource = readFileSync(
  join(here, "..", "sign-in-methods", "index.tsx"),
  "utf8"
)

describe("Login: the cart sidebar's block, no orphan divider (t-2026-10-04-24)", () => {
  it("draws the methods through SignInMethods, the block the cart sidebar and the modal share", () => {
    expect(loginSource).toContain("<SignInMethods")
    expect(methodsSource).toContain("allowsEmailLogin(loginSettings.method)")
    expect(methodsSource).toContain("yandexLoginAvailable(loginSettings)")
  })

  it("has no «или» divider left, on the page or in the block", () => {
    // cherkashino.ru is Yandex ID only: the divider stood alone under an empty gap.
    for (const source of [loginSource, methodsSource, yandexSource]) {
      expect(source).not.toContain("yandexDivider")
    }
  })

  it("the e-mail form and «Забыли пароль?» are both gated on the shop signing in by e-mail", () => {
    expect(methodsSource).toContain("{emailSignIn && emailOpen ? (")
    const guard = loginSource.indexOf("{emailEnabled && (")
    expect(guard).not.toBe(-1)
    expect(loginSource.indexOf('t("forgotPassword")')).toBeGreaterThan(guard)
    expect(loginSource).toContain("allowsEmailLogin(loginSettings.method)")
  })

  it("shows the Yandex ID error message, gated by its own available prop", () => {
    expect(loginSource).toContain("<YandexLoginError available={yandexEnabled} />")
    expect(loginSource).toContain("yandexLoginAvailable(loginSettings)")
  })
})

describe("LoginTemplate: Register and ForgotPassword are email-and-password views", () => {
  it("REGISTER only renders when emailEnabled", () => {
    expect(templateSource).toMatch(
      /currentView === LOGIN_VIEW\.REGISTER && emailEnabled/
    )
  })

  it("FORGOT_PASSWORD only renders when emailEnabled", () => {
    expect(templateSource).toMatch(
      /currentView === LOGIN_VIEW\.FORGOT_PASSWORD && emailEnabled/
    )
  })

  it("emailEnabled is derived from the loginSettings prop, not hardcoded", () => {
    expect(templateSource).toContain("allowsEmailLogin(loginSettings.method)")
  })
})

describe("YandexLoginError: gated on its prop, no module-level env check left behind", () => {
  it("renders nothing when available is false", () => {
    expect(yandexSource).toContain("if (!available) {")
    expect(yandexSource).toContain("return null")
  })

  it("no longer decides availability from NEXT_PUBLIC_YANDEX_LOGIN_ENABLED itself", () => {
    expect(yandexSource).not.toContain("NEXT_PUBLIC_YANDEX_LOGIN_ENABLED")
  })
})
