#!/usr/bin/env node
/**
 * No secret in clear text on the CDEK screens. It opens «Доставка СДЭК» and
 * «Подключение → СДЭК» as the owner and fails when:
 *
 *  - the screen's text carries `token=<value>` before anything is pressed;
 *  - the address does not come back after «Показать» (the control must reveal,
 *    not lose, the value) or stays after «Скрыть»;
 *  - a CDEK login field is a plain text field.
 *
 *   PANEL_URL=http://localhost:5381 OWNER_PASSWORD=… \
 *   SHOT_DIR=artifacts/docs/t-2026-09-21-02/secrets WIDTH=390 \
 *     node apps/tenant-panel/e2e/owner-secrets-probe.e2e.mjs
 *
 * It never prints a value, and the screenshots are taken only while the values
 * are hidden. It reads, it does not write. A shop without a CDEK account has no
 * address to hide: that check is then reported as skipped.
 */
import { createRequire } from "node:module"
import { mkdirSync } from "node:fs"
import { join, resolve } from "node:path"

const require = createRequire(import.meta.url)
const PLAYWRIGHT =
  process.env.PLAYWRIGHT ||
  new URL("../../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright", import.meta.url)
    .pathname
const { chromium } = require(PLAYWRIGHT)

const PANEL = (process.env.PANEL_URL || "http://localhost:5180").replace(/\/$/, "")
const EMAIL = process.env.OWNER_EMAIL || "owner-cherkashino@example.test"
const PASSWORD = process.env.OWNER_PASSWORD
const WIDTH = Number(process.env.WIDTH || 390)
const SHOT_DIR = resolve(process.env.SHOT_DIR || "artifacts/docs/t-2026-09-21-02/secrets")

if (!PASSWORD) {
  console.error("OWNER_PASSWORD is required (the stand's owner password)")
  process.exit(2)
}

mkdirSync(SHOT_DIR, { recursive: true })
const phone = WIDTH <= 480
const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: WIDTH, height: phone ? 844 : 900 },
  deviceScaleFactor: phone ? 2 : 1,
  isMobile: phone,
  hasTouch: phone,
  locale: "ru-RU",
})
const page = await context.newPage()

const SECRET_IN_TEXT = /\b(?:token|secret|password|key)=[^\s&•]{6,}/i
let failed = 0
const check = (name, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`)
  if (!ok) {
    failed += 1
  }
}
const open = async (path) => {
  await page.evaluate((to) => {
    history.pushState({}, "", to)
    dispatchEvent(new PopStateEvent("popstate", { state: {} }))
  }, path)
  await page.waitForLoadState("networkidle").catch(() => {})
  await page.waitForTimeout(1200)
}
const text = () => page.evaluate(() => document.body.innerText)

try {
  await page.goto(`${PANEL}/login`)
  await page.locator('input[name="email"]').fill(EMAIL)
  await page.locator('input[name="password"]').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForFunction(() => !location.pathname.endsWith("/login"), null, { timeout: 30_000 })

  await open("/settings/delivery")
  check("delivery: no secret in the text of the screen", !SECRET_IN_TEXT.test(await text()))
  await page.screenshot({ path: join(SHOT_DIR, `delivery-hidden-${WIDTH}.png`), fullPage: true })

  const address = page.getByTestId("delivery-webhook-address")
  if (await address.count()) {
    await address.getByRole("button").first().click()
    check("delivery: «Показать» brings the address back", SECRET_IN_TEXT.test(await text()))
    await address.getByRole("button").first().click()
    check("delivery: «Скрыть» hides it again", !SECRET_IN_TEXT.test(await text()))
  } else {
    console.log("skip delivery: the shop has no CDEK account, so no address is shown")
  }

  await open("/settings/integrations/cdek")
  check("cdek: no secret in the text of the screen", !SECRET_IN_TEXT.test(await text()))
  for (const id of ["cdek-test-account", "cdek-account"]) {
    const type = await page.getByTestId(id).getAttribute("type")
    check(`cdek: ${id} is hidden until the eye is pressed (type=${type})`, type === "password")
  }
  await page.screenshot({ path: join(SHOT_DIR, `cdek-hidden-${WIDTH}.png`), fullPage: true })
} catch (error) {
  console.error(`FAIL the walk stopped: ${String(error.message).split("\n")[0]}`)
  failed += 1
} finally {
  await browser.close()
}

console.log(failed ? `\nsecrets probe: ${failed} failed` : "\nsecrets probe: all hidden")
process.exit(failed ? 1 : 0)
