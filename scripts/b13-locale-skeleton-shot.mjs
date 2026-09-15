#!/usr/bin/env node
/**
 * b13-locale-single-source acceptance shot: /settings/locale WHILE
 * `GET /tenants/locale-settings` is still in flight, proving the fix for f06
 * nit 3 — the screen now shows the real controls disabled rather than
 * `SingleColumnPageSkeleton`.
 *
 * The delay is injected client-side through Playwright route interception
 * (`page.route` + a fixed `setTimeout` before `route.continue()`), logged to
 * stdout with the exact millisecond figure, per rule 18f ("a mode you name is
 * a coordinate you must have entered").
 *
 *   PANEL_URL=http://localhost:5180 BACKEND_URL=http://localhost:9033 \
 *     PANEL_EMAIL=admin@b13shopru.example \
 *     node scripts/b13-locale-skeleton-shot.mjs
 *
 * Output: artifacts/docs/b13-locale-single-source/locale-settings-loading-1280x900.png
 */
import { createRequire } from "node:module"
import { mkdirSync } from "node:fs"
import path from "node:path"

const require = createRequire(import.meta.url)
const { chromium } = require(
  new URL("../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright", import.meta.url).pathname
)

const PANEL = process.env.PANEL_URL || "http://localhost:5180"
const EMAIL = process.env.PANEL_EMAIL || "admin@b13shopru.example"
const PASSWORD = process.env.PANEL_PASSWORD || "supersecret"
const DELAY_MS = Number(process.env.SHOT_DELAY_MS || 4000)

const OUT = path.resolve("artifacts/docs/b13-locale-single-source")
mkdirSync(OUT, { recursive: true })

const login = async (page) => {
  await page.goto(`${PANEL}/login`, { waitUntil: "networkidle" })
  await page.locator('input[name="email"]').fill(EMAIL)
  await page.locator('input[name="password"]').fill(PASSWORD)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForFunction(() => !location.pathname.endsWith("/login"), null, { timeout: 30_000 })
}

const main = async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()

  await login(page)
  console.log(`b13-shot: logged in as ${EMAIL}`)

  // Delays ONLY the locale-settings GET, so the rest of the shell (nav, page
  // frame) is already drawn when the screenshot is taken mid-flight.
  await page.route("**/tenants/locale-settings", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue()
      return
    }
    console.log(`b13-shot: delaying GET /tenants/locale-settings by ${DELAY_MS}ms`)
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS))
    await route.continue()
  })

  const gotoStarted = Date.now()
  const navigation = page.goto(`${PANEL}/settings/locale`, { waitUntil: "domcontentloaded" })
  // Shoot partway through the artificial delay, well before the response lands.
  await page.waitForTimeout(Math.min(DELAY_MS - 500, 2500))
  await navigation.catch(() => {})

  const skeletonCount = await page.locator(".animate-pulse").count()
  const selectDisabled = await page
    .locator('[data-testid="default-locale"] button, [data-testid="default-locale"]')
    .first()
    .isDisabled()
    .catch(() => null)

  const file = path.join(OUT, "locale-settings-loading-1280x900.png")
  await page.screenshot({ path: file })
  console.log(`b13-shot: screenshot at +${Date.now() - gotoStarted}ms →`, file)
  console.log(`b13-shot: .animate-pulse count on screen = ${skeletonCount} (0 = no skeleton, real control shown)`)
  console.log(`b13-shot: default-locale control disabled = ${selectDisabled}`)

  await browser.close()
}

main().catch((e) => {
  console.error("FAILED:", e.message)
  process.exit(1)
})
