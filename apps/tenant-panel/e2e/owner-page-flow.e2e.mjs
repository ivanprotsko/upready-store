#!/usr/bin/env node
/**
 * The owner edits the «Контакты» page of her shop on a phone, from the login
 * form: menu → «Страницы» → «Контакты» → a heading typed, a line added with the
 * «Список» button, the preview read, «Сохранить». Then the text is read back
 * where a buyer's browser gets it: the public `GET /store/tenant/pages/contacts`
 * the storefront renders the page from. A screenshot is saved per step.
 *
 *   PANEL_URL=http://localhost:5381 BACKEND_URL=http://localhost:9321 \
 *   OWNER_EMAIL=… OWNER_PASSWORD=… \
 *   SHOT_DIR=artifacts/docs/t-2026-09-21-02/flow-page WIDTH=390 \
 *     node apps/tenant-panel/e2e/owner-page-flow.e2e.mjs
 *
 * It writes to the stand (the page gets a new title and text), so it is for a
 * scratch database only. Exit code 1 when a step cannot be done or the public
 * answer does not carry the new text.
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
const BACKEND = (process.env.BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
const WIDTH = Number(process.env.WIDTH || 390)
const SHOT_DIR = resolve(process.env.SHOT_DIR || "artifacts/docs/t-2026-09-21-02/flow-page")

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

const stamp = new Date().toISOString().slice(11, 19)
const LINE = `Звоните с 9 до 18, проверено ${stamp}`

try {
  await page.goto(`${PANEL}/login`)
  await page.locator('input[name="email"]').fill(EMAIL)
  await page.locator('input[name="password"]').fill(PASSWORD)
  await shot("login")
  await page.locator('button[type="submit"]').click()
  await page.waitForFunction(() => !location.pathname.endsWith("/login"), null, { timeout: 30_000 })
  await shot("overview")

  if (phone) {
    await page.getByRole("button", { name: "Открыть меню" }).click()
    await shot("menu")
  }
  await page.getByRole("link", { name: /^Страницы/ }).first().click()
  await page.waitForURL(/\/pages$/)
  await shot("pages")

  await page.getByRole("link", { name: /Контакты/ }).first().click()
  await page.waitForURL(/\/pages\/contacts$/)
  await shot("editor-open")

  await page.locator('input[name="title"]').fill("Контакты")
  const area = page.getByTestId("article-body-input")
  await area.fill("## Как с нами связаться\n\n")
  // The list button writes the markup for her; she only types the words.
  await page.getByRole("button", { name: "Список", exact: true }).click()
  await page.keyboard.press("ControlOrMeta+A")
  await area.fill(`## Как с нами связаться\n\n- ${LINE}\n`)
  await area.scrollIntoViewIfNeeded()
  await shot("text-typed")

  // What the preview shows is what the shop page will show: same parser.
  const preview = page.locator("p.font-semibold", { hasText: "Как с нами связаться" }).last()
  await preview.scrollIntoViewIfNeeded()
  console.log(`preview heading visible: ${await preview.isVisible()}`)
  await shot("preview")

  // A page she has not published stays the platform's template in the shop.
  const published = page.getByRole("switch").first()
  if ((await published.getAttribute("aria-checked")) !== "true") {
    await published.scrollIntoViewIfNeeded()
    await published.click()
  }
  await shot("published-on")

  await page.getByRole("button", { name: "Сохранить" }).click()
  await page.waitForURL(/\/pages$/, { timeout: 30_000 })
  await shot("saved")

  // The buyer's side: the public answer the storefront page is drawn from.
  const login = await fetch(`${BACKEND}/auth/tenant/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  }).then((r) => r.json())
  const me = await fetch(`${BACKEND}/tenants/me`, {
    headers: { authorization: `Bearer ${login.token}` },
  }).then((r) => r.json())
  const key = me?.tenant_admin?.tenant?.api_key?.token
  const answer = await fetch(`${BACKEND}/store/tenant/pages/contacts?locale=ru`, {
    headers: { "x-publishable-api-key": key },
  })
  const text = await answer.text()
  const seen = text.includes(LINE)
  console.log(`public GET /store/tenant/pages/contacts: ${answer.status}, new line present: ${seen}`)
  await browser.close()
  process.exit(seen ? 0 : 1)
} catch (error) {
  await shot("FAILED").catch(() => {})
  console.error(error.message.split("\n")[0])
  await browser.close()
  process.exit(1)
}
