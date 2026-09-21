#!/usr/bin/env node
/**
 * The owner's daily job on a phone, from the login form: open «Заказы», open
 * the first order that waits to be packed, press the next-step button, confirm
 * the packing dialog, then hand the parcel over to delivery with a tracking
 * number. A screenshot is saved per step and the state the screen shows is
 * read back from the screen.
 *
 *   PANEL_URL=http://localhost:5381 OWNER_EMAIL=… OWNER_PASSWORD=… \
 *   SHOT_DIR=artifacts/docs/t-2026-09-21-02/flow-order WIDTH=390 \
 *     node apps/tenant-panel/e2e/owner-order-flow.e2e.mjs
 *
 * It writes to the stand (one order gets packed and shipped), so it is for a
 * scratch database only. Exit code 1 when a step cannot be done.
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
const SHOT_DIR = resolve(process.env.SHOT_DIR || "artifacts/docs/t-2026-09-21-02/flow-order")

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
let n = 0
const shot = async (name) => {
  n += 1
  await page.waitForLoadState("networkidle").catch(() => {})
  await page.waitForTimeout(700)
  const path = join(SHOT_DIR, `${String(n).padStart(2, "0")}-${name}-${WIDTH}.png`)
  await page.screenshot({ path })
  const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth)
  console.log(`step ${n} ${name}: scrollWidth=${overflow} ${path}`)
}

try {
  await page.goto(`${PANEL}/login`)
  await page.locator('input[name="email"]').fill(EMAIL)
  await page.locator('input[name="password"]').fill(PASSWORD)
  await shot("login")
  await page.locator('button[type="submit"]').click()
  await page.waitForFunction(() => !location.pathname.endsWith("/login"), null, { timeout: 30_000 })
  await shot("overview")

  // The menu: on a phone it is a drawer opened from the top bar.
  if (phone) {
    await page.getByRole("button", { name: "Открыть меню" }).click()
    await shot("menu")
  }
  await page.getByRole("link", { name: /^Заказы/ }).first().click()
  await page.waitForURL(/\/orders$/)
  await shot("orders")

  // The first order that still waits to be packed.
  const waiting = page.locator("tbody tr", { hasText: "Ждёт сборки" }).filter({ hasNotText: "Оплата отменена" }).first()
  await waiting.locator("a").first().click()
  await page.waitForURL(/\/orders\/order_/)
  await shot("order-waits")

  await page.getByTestId("order-next-step-pack").click()
  await page.waitForURL(/\/fulfillment/)
  await shot("pack-dialog")
  await page.getByRole("button", { name: "Собрать заказ" }).click()
  await page.waitForURL(/\/orders\/order_[^/]+$/, { timeout: 30_000 })
  await shot("order-packed")

  await page.getByTestId("order-next-step-ship").click()
  await page.waitForURL(/create-shipment/)
  // The field is found the way she finds it: by its example value.
  await page.getByPlaceholder("123-456-789").first().fill("RU123456789")
  await shot("ship-dialog")
  await page.getByRole("button", { name: /Сохранить|Создать|Передать/ }).last().click()
  await page.waitForURL(/\/orders\/order_[^/]+$/, { timeout: 30_000 })
  await shot("order-shipped")

  const title = await page.getByTestId("order-next-step").locator("h2").innerText()
  console.log(`next step now reads: ${title}`)
  await browser.close()
} catch (error) {
  await shot("FAILED").catch(() => {})
  console.error(error.message.split("\n")[0])
  await browser.close()
  process.exit(1)
}
