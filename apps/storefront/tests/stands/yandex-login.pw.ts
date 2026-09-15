import { expect, test } from "@playwright/test"

/**
 * «Sign in with Yandex ID» on a running storefront (w02-yandex-id-auth).
 *
 * Walks the leg the buyer walks and nothing more: the control is on the login
 * page, pressing it leaves this site and lands on the Yandex consent screen
 * with this application's own parameters on the URL. It stops there on purpose.
 * Signing in would need the personal Yandex account that exists for the manual
 * end-to-end check alone, and an automated suite must never drive it.
 *
 * The control renders only when the stand sets NEXT_PUBLIC_YANDEX_LOGIN_ENABLED
 * (and the backend has YANDEX_CLIENT_ID). On a stand without them the button is
 * absent BY DESIGN, so the first test says which of the two it measured rather
 * than reporting a silent pass on an empty page — a skip that looks like a green
 * run is the thing worth avoiding here (rule 20a: zero is not empty).
 */

const LOGIN_PATH = "/ru/account"

test.describe("yandex id login", () => {
  test.describe.configure({ mode: "serial" })

  test("the login page carries the Yandex control when the stand has the feature on", async ({
    page,
  }) => {
    await page.goto(LOGIN_PATH)
    await expect(page.getByTestId("login-page")).toBeVisible()

    const cta = page.getByTestId("yandex-login-cta")
    const present = await cta.count()

    if (present === 0) {
      test.info().annotations.push({
        type: "measured",
        description:
          "no Yandex control on this stand: NEXT_PUBLIC_YANDEX_LOGIN_ENABLED is off here",
      })
      test.skip(true, "stand has the Yandex login switched off")
      return
    }

    await expect(cta).toBeVisible()
    // It is a link, so the first leg works without client-side JavaScript.
    await expect(cta).toHaveAttribute("href", /^\/api\/yandex-login\?return=/)
    await page.screenshot({
      path: "test-results/yandex-login-button.png",
      fullPage: false,
    })
  })

  test("pressing it lands on the Yandex consent screen for this application", async ({
    page,
  }) => {
    await page.goto(LOGIN_PATH)
    const cta = page.getByTestId("yandex-login-cta")
    if ((await cta.count()) === 0) {
      test.skip(true, "stand has the Yandex login switched off")
      return
    }

    await cta.click()
    await page.waitForURL(/(oauth|passport)\.yandex\.(ru|com)/, {
      timeout: 30_000,
    })

    const landed = new URL(page.url())
    // Yandex sends an anonymous visitor on to passport with the whole authorize
    // URL in `retpath`, so the parameters are asserted wherever they ended up.
    const carrier = landed.searchParams.get("retpath")
      ? new URL(landed.searchParams.get("retpath")!)
      : landed

    expect(carrier.searchParams.get("response_type")).toBe("code")
    expect(carrier.searchParams.get("client_id")).toBeTruthy()
    expect(carrier.searchParams.get("redirect_uri")).toContain(
      "/api/yandex-callback",
    )
    expect(carrier.searchParams.get("state")).toContain(".")

    await page.screenshot({
      path: "test-results/yandex-consent-screen.png",
      fullPage: false,
    })
  })

  test("a failed attempt comes back as a sentence, not a stack trace", async ({
    page,
  }) => {
    await page.goto(`${LOGIN_PATH}?yandex_error=denied`)

    const cta = page.getByTestId("yandex-login-cta")
    if ((await cta.count()) === 0) {
      test.skip(true, "stand has the Yandex login switched off")
      return
    }

    const message = page.getByTestId("yandex-login-error")
    await expect(message).toBeVisible()
    await expect(message).not.toContainText(/error|stack|undefined/i)
  })
})
