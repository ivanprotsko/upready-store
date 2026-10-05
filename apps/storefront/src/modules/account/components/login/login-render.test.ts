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
const buttonSource = readFileSync(
  join(here, "..", "yandex-login", "yandex-id-button.tsx"),
  "utf8"
)
const modalSource = readFileSync(join(here, "..", "login-modal", "index.tsx"), "utf8")
const checkoutModalSource = readFileSync(
  join(here, "..", "..", "..", "checkout", "components", "checkout-modal", "index.tsx"),
  "utf8"
)
const checkoutSignInSource = readFileSync(
  join(here, "..", "..", "..", "checkout", "components", "checkout-sign-in", "index.tsx"),
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
    expect(loginSource).toContain("<YandexLoginError available={yandexEnabled}")
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

describe("Yandex ID: the button from Yandex's constructor, one shared place (t-2026-10-04-45)", () => {
  it("keeps the server-redirect link, built in YandexIdButton alone", () => {
    expect(buttonSource).toContain("href={`/api/yandex-login?return=${encodeURIComponent(returnTo)}`}")
    for (const source of [methodsSource, checkoutSignInSource, loginSource]) {
      expect(source).not.toContain("/api/yandex-login?return=")
    }
    expect(methodsSource).toContain("<YandexIdButton")
    expect(checkoutSignInSource).toContain("<YandexIdButton")
    // The SDK's suggest/token flow stays out: the button is a plain link.
    expect(buttonSource).not.toContain("YaAuthSuggest")
  })

  it("draws the constructor's s / main / radius 8 button, light and dark by the site's mode", () => {
    for (const cls of ["h-10", "rounded-lg", "px-[11px]", "py-[9px]", "text-[14px]", "leading-4", "min-w-[156px]"]) {
      expect(buttonSource).toContain(cls)
    }
    // Black on a light site, white on a dark one: the pair lives in globals.css and swaps on
    // [data-mode], the axis the presets switch on (t-theme-hardcoded-colours, no dark: variant).
    expect(buttonSource).toContain("bg-[var(--yandex-id-bg)] text-[var(--yandex-id-fg)]")
    const globalsCss = readFileSync(join(here, "../../../../styles/globals.css"), "utf8")
    expect(globalsCss).toMatch(/:root \{[^}]*--yandex-id-bg: #000000;[^}]*--yandex-id-fg: #ffffff;/)
    expect(globalsCss).toMatch(/\[data-mode="dark"\] \{[^}]*--yandex-id-bg: #ffffff;[^}]*--yandex-id-fg: #000000;/)
    expect(buttonSource).toContain("font-['YS_Text','Helvetica_Neue',Arial,sans-serif]")
    expect(buttonSource).toContain('fill="#FC3F1D"')
    expect(buttonSource).toContain("/images/yandex-id/avatar-placeholder.png")
  })

  it("gives Yandex ID a row of its own: only e-mail and Telegram pair up", () => {
    expect(methodsSource).toContain("const cells = [emailSignIn, telegramBot !== null].filter(Boolean).length")
    expect(methodsSource).toContain('className={clx(cells > 1 && "col-span-2")}')
    expect(checkoutSignInSource).toContain('className={clx(cells > 1 && "small:col-span-2")}')
  })

  it("the modal is a 320 px column, 24 px all round from 640 px up and 16 on a phone", () => {
    expect(modalSource).toContain("compact>")
    expect(checkoutModalSource).toContain('compact ? "sm:w-[368px]" : "sm:w-[540px]"')
    expect(checkoutModalSource).toContain("max-w-[352px]")
    expect(checkoutModalSource).toContain("p-4 sm:max-w-none sm:p-6")
  })

  it("aligns the modal's text to the start edge, the page keeps its centred column", () => {
    expect(loginSource).toContain('inModal ? "items-start text-start" : "items-center text-center"')
    expect(loginSource).toContain("<YandexLoginError available={yandexEnabled} alignStart={inModal} />")
    expect(loginSource).toContain('inModal ? "self-start" : "self-center"')
  })
})
