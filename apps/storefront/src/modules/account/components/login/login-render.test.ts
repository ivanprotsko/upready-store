import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * o25-login-methods: the login/register screens render only the methods this
 * shop chose. `Login`, `LoginTemplate` and `YandexLogin` are client components
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

describe("Login: which controls render per mode", () => {
  it("the email/password form is wrapped in emailEnabled, not always rendered", () => {
    const formIndex = loginSource.indexOf("{emailEnabled && (\n        <form")
    expect(formIndex).not.toBe(-1)
  })

  it("emailEnabled comes from allowsEmailLogin(loginSettings.method), not a guess", () => {
    expect(loginSource).toContain("allowsEmailLogin(loginSettings.method)")
  })

  it("the Yandex control always renders, gated by its own available prop", () => {
    expect(loginSource).toContain("<YandexLogin available={yandexEnabled} />")
    expect(loginSource).toContain("yandexLoginAvailable(loginSettings)")
  })

  it("the \"not a member? join us\" register trigger is hidden with the email form", () => {
    // Exactly two blocks are gated on emailEnabled: the form itself, and this
    // trigger. A third occurrence would mean something else started reading
    // the same flag, and one occurrence would mean the trigger stopped being
    // guarded.
    const guardCount = loginSource.split("{emailEnabled && (").length - 1
    expect(guardCount).toBe(2)

    const secondGuardIndex = loginSource.indexOf(
      "{emailEnabled && (",
      loginSource.indexOf("{emailEnabled && (") + 1
    )
    const notMemberIndex = loginSource.indexOf('t("notMember")')
    expect(notMemberIndex).toBeGreaterThan(secondGuardIndex)
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

describe("YandexLogin: gated on its prop, no module-level env check left behind", () => {
  it("renders nothing when available is false", () => {
    expect(yandexSource).toContain("if (!available) {")
    expect(yandexSource).toContain("return null")
  })

  it("no longer decides availability from NEXT_PUBLIC_YANDEX_LOGIN_ENABLED itself", () => {
    expect(yandexSource).not.toContain("NEXT_PUBLIC_YANDEX_LOGIN_ENABLED")
  })
})
