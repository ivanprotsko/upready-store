import { expect, test, type Page } from "@playwright/test"

/**
 * T0i acceptance, run against a live storefront (rule 18f: acceptance is reality).
 *
 * Environment:
 *   STUDIO_URL           storefront started WITH STOREFRONT_STUDIO_PASSWORD (baseURL)
 *   STUDIO_PASSWORD      that password
 * The "feature switched off" case needs a storefront started WITHOUT the variable, so it
 * lives in disabled.pw.ts and runs as its own pass against a restarted stand.
 *
 * Every test here has a reverse run recorded in the report: the behaviour is removed from
 * the source, the test goes red, the source is restored. A green test nobody has seen fail
 * proves nothing.
 */

const PASSWORD = process.env.STUDIO_PASSWORD ?? "t0i-panel-2026"

const HOLD_OPENS_MS = 2400
const HOLD_STAYS_A_LINK_MS = 1500

/** Press and hold the desktop brand link for `ms`, then release. */
async function holdBrand(page: Page, ms: number) {
  const brand = page.getByTestId("nav-store-link")
  await expect(brand).toBeVisible()
  const box = await brand.boundingBox()
  if (!box) throw new Error("brand link has no box")
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(ms)
  await page.mouse.up()
}

/** Take the cookie the way a browser does: through the route, then reload. */
async function unlock(page: Page) {
  const res = await page.request.post("/api/studio/unlock", { data: { password: PASSWORD } })
  expect(res.status()).toBe(200)
  await page.goto("/")
}

test.describe("hidden settings panel", () => {
  test("a visitor's HTML carries neither button nor popover", async ({ page, request }) => {
    const res = await request.get("/")
    const html = await res.text()
    expect(res.status()).toBe(200)
    expect(html).not.toContain('data-testid="studio-button"')
    expect(html).not.toContain('data-testid="studio-popover"')

    await page.goto("/")
    await expect(page.getByTestId("studio-button")).toHaveCount(0)
  })

  test("a 1.5 s press stays an ordinary link to /", async ({ page }) => {
    await page.goto("/store")
    const before = new URL(page.url()).pathname
    await holdBrand(page, HOLD_STAYS_A_LINK_MS)
    await page.waitForURL((url) => new URL(url).pathname !== before, { timeout: 15_000 })
    // the locale prefix is the middleware's; what matters is that we left /store for home
    expect(new URL(page.url()).pathname).not.toContain("/store")
    await expect(page.getByTestId("studio-unlock-dialog")).toBeHidden()
  })

  test("a 2 s press opens the password dialog and does not navigate", async ({ page }) => {
    await page.goto("/store")
    const before = page.url()
    await holdBrand(page, HOLD_OPENS_MS)
    await expect(page.getByTestId("studio-unlock-dialog")).toBeVisible()
    expect(page.url()).toBe(before)
  })

  test("the click that ends a long press is swallowed, not navigated", async ({ page }) => {
    // The previous test passes even with the swallow removed, because a modal <dialog>
    // makes the rest of the page inert — measured in the reverse run of 2026-09-08. This
    // one takes the inertness away: Esc closes the dialog while the button is STILL down,
    // so the click that follows the release reaches the link, and only the wrapper's
    // onClickCapture can stop it.
    await page.goto("/store")
    const before = page.url()
    const brand = page.getByTestId("nav-store-link")
    const box = await brand.boundingBox()
    if (!box) throw new Error("brand link has no box")
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(HOLD_OPENS_MS)
    await expect(page.getByTestId("studio-unlock-dialog")).toBeVisible()

    await page.keyboard.press("Escape")
    await expect(page.getByTestId("studio-unlock-dialog")).toHaveCount(0)
    await page.mouse.up()

    await page.waitForTimeout(1500)
    expect(page.url()).toBe(before)
  })

  test("a wrong password shows an error and sets no cookie", async ({ page, context }) => {
    await page.goto("/")
    await holdBrand(page, HOLD_OPENS_MS)
    await page.getByTestId("studio-password").fill(`${PASSWORD}-wrong`)
    await page.getByTestId("studio-unlock-submit").click()

    await expect(page.getByTestId("studio-unlock-error")).toBeVisible()
    await expect(page.getByTestId("studio-unlock-error")).toContainText("does not match")

    const cookies = await context.cookies()
    expect(cookies.find((c) => c.name === "upready_studio")).toBeUndefined()

    await page.reload()
    await expect(page.getByTestId("studio-button")).toHaveCount(0)
  })

  test("the right password sets an httpOnly cookie and reveals the button", async ({
    page,
    context,
  }) => {
    await page.goto("/")
    await holdBrand(page, HOLD_OPENS_MS)
    await page.getByTestId("studio-password").fill(PASSWORD)
    await page.getByTestId("studio-unlock-submit").click()

    await expect(page.getByTestId("studio-button")).toBeVisible()

    const cookie = (await context.cookies()).find((c) => c.name === "upready_studio")
    expect(cookie, "the unlock cookie").toBeDefined()
    expect(cookie?.httpOnly).toBe(true)
    expect(cookie?.sameSite).toBe("Lax")
    // seven days, within a minute of tolerance for the round trip
    const days = ((cookie?.expires ?? 0) * 1000 - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(6.99)
    expect(days).toBeLessThan(7.01)

    // and the cookie is out of reach of page scripts
    expect(await page.evaluate(() => document.cookie)).not.toContain("upready_studio")
  })

  test("flipping the preset changes --background on <html> and the body background", async ({
    page,
  }) => {
    await unlock(page)
    await page.getByTestId("studio-button").click()
    await expect(page.getByTestId("studio-popover")).toBeVisible()

    const read = () =>
      page.evaluate(() => ({
        attr: document.documentElement.getAttribute("data-theme"),
        variable: getComputedStyle(document.documentElement)
          .getPropertyValue("--background")
          .trim(),
        body: getComputedStyle(document.body).backgroundColor,
      }))

    await page.getByTestId("studio-preset-medusa").click()
    const before = await read()

    await page.getByTestId("studio-preset-supplements").click()
    const after = await read()

    expect(after.attr).toBe("supplements")
    expect(after.variable).not.toBe(before.variable)
    expect(after.body).not.toBe(before.body)

    // the source line names the preset in plain language, never its id
    const source = page.getByTestId("studio-source")
    await expect(source).toContainText("Rendered from 31 tokens of preset Scruple.")
    await expect(source).not.toContainText("supplements")
  })

  test("flipping the mode changes data-mode and the body background", async ({ page }) => {
    await unlock(page)
    await page.getByTestId("studio-button").click()
    await page.getByTestId("studio-mode-light").click()
    const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)

    await page.getByTestId("studio-mode-dark").click()
    const dark = await page.evaluate(() => ({
      attr: document.documentElement.getAttribute("data-mode"),
      body: getComputedStyle(document.body).backgroundColor,
    }))

    expect(dark.attr).toBe("dark")
    expect(dark.body).not.toBe(light)
  })

  test("reset puts both axes back and clears the stored choice", async ({ page }) => {
    await unlock(page)
    await page.getByTestId("studio-button").click()
    await page.getByTestId("studio-preset-geist").click()
    await page.getByTestId("studio-mode-dark").click()

    await page.getByTestId("studio-reset").click()

    expect(
      await page.evaluate(() => ({
        theme: document.documentElement.getAttribute("data-theme"),
        mode: document.documentElement.getAttribute("data-mode"),
        storedTheme: localStorage.getItem("upready-store.theme"),
        storedMode: localStorage.getItem("upready-store.mode"),
      }))
    ).toEqual({ theme: "default", mode: "light", storedTheme: null, storedMode: null })
  })

  test("the stored preset is on <html> before the first paint", async ({ page }) => {
    await unlock(page)
    await page.evaluate(() => localStorage.setItem("upready-store.theme", "supplements"))

    // read the attribute at the earliest moment a document-level listener can run, and
    // again when the body's first element exists — the pre-paint script sits in <head>,
    // so both must already say "supplements"
    await page.addInitScript(() => {
      document.addEventListener("readystatechange", () => {
        const w = window as unknown as Record<string, unknown>
        if (!w.__themeAtInteractive && document.readyState === "interactive") {
          w.__themeAtInteractive = document.documentElement.getAttribute("data-theme")
        }
      })
      document.addEventListener("DOMContentLoaded", () => {
        const w = window as unknown as Record<string, unknown>
        w.__themeAtDCL = document.documentElement.getAttribute("data-theme")
      })
    })

    await page.reload()
    expect(
      await page.evaluate(() => {
        const w = window as unknown as Record<string, unknown>
        return { interactive: w.__themeAtInteractive, dcl: w.__themeAtDCL }
      })
    ).toEqual({ interactive: "supplements", dcl: "supplements" })
  })

  test("lock removes the cookie and the button", async ({ page, context }) => {
    await unlock(page)
    await page.getByTestId("studio-button").click()
    await page.getByTestId("studio-lock").click()

    await expect(page.getByTestId("studio-button")).toHaveCount(0)
    const cookie = (await context.cookies()).find(
      (c) => c.name === "upready_studio" && c.value !== ""
    )
    expect(cookie).toBeUndefined()
  })

  test("a forged cookie is refused", async ({ page, context }) => {
    const url = new URL(page.url() === "about:blank" ? "http://host.docker.internal" : page.url())
    await context.addCookies([
      {
        name: "upready_studio",
        value: `v1.${Math.floor(Date.now() / 1000) + 86_400}.forged`,
        domain: url.hostname,
        path: "/",
      },
    ])
    await page.goto("/")
    await expect(page.getByTestId("studio-button")).toHaveCount(0)
  })

})
