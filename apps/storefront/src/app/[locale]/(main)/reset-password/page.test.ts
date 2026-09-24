import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * o25-login-methods: `/reset-password` is reachable by a direct or bookmarked
 * link, outside the `Login`/`LoginTemplate` state machine those components
 * gate themselves. A Yandex-only shop has no password to reset, so this page
 * has to make the same call on its own rather than rendering a form the
 * backend (`login-method-gate.ts`) will only refuse. Server component, async,
 * no renderer here — asserted on source, the same as the other login-methods
 * render tests.
 */

const here = dirname(fileURLToPath(import.meta.url))
const pageSource = readFileSync(join(here, "page.tsx"), "utf8")

describe("ResetPasswordPage: hides the form for a shop with no password to reset", () => {
  it("checks allowsEmailLogin before ever rendering the ResetPassword form", () => {
    const guardIndex = pageSource.indexOf("!allowsEmailLogin(loginSettings.method)")
    const formIndex = pageSource.indexOf("<ResetPassword")
    expect(guardIndex).not.toBe(-1)
    expect(formIndex).toBeGreaterThan(guardIndex)
  })

  it("the disabled branch links back to sign-in rather than dead-ending", () => {
    const guardIndex = pageSource.indexOf("!allowsEmailLogin(loginSettings.method)")
    const returnIndex = pageSource.indexOf("return (", guardIndex)
    const formIndex = pageSource.indexOf("<ResetPassword")
    const disabledBlock = pageSource.slice(returnIndex, formIndex)
    expect(disabledBlock).toContain('href="/account"')
    expect(disabledBlock).toContain('t("notAvailable")')
  })

  it("loginSettings comes from the tenant, not assumed enabled", () => {
    expect(pageSource).toContain("getSiteLoginSettings()")
  })
})
