import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
const req = createRequire(path.join(homedir(), "upready/projects/upready-store/node_modules", "index.js"))
const { chromium } = req("playwright")
const PANEL = "https://panel-store.upready.dev"
const owner = readFileSync(path.join(homedir(), "upready/.private/upready-store-day-2026-09-16/cherkashino-owner.md"), "utf8")
const EMAIL = /E-mail владельца[^:]*:\s*(\S+)/.exec(owner)[1]
const PASS = /Пароль:\s*(\S+)/.exec(owner)[1]
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "ru-RU" })
const page = await ctx.newPage()
await page.goto(`${PANEL}/login`, { waitUntil: "domcontentloaded" })
await page.locator('input[name="email"]').fill(EMAIL)
await page.locator('input[name="password"]').fill(PASS)
await page.locator('button[type="submit"]').click()
await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 45000 })
for (const p of ["/settings/wildberries", "/settings/ozon", "/settings/marketplaces", "/settings/integrations"]) {
  await page.goto(`${PANEL}${p}`, { waitUntil: "domcontentloaded" })
  // ждём ПОЛОЖИТЕЛЬНЫЙ признак: страница отрисовала свой заголовок
  const t0 = Date.now()
  while (Date.now() - t0 < 30000) {
    const t = await page.evaluate(() => document.body.innerText)
    if (/Wildberries|Ozon|Подключение|Маркетплейс/i.test(t)) break
    await page.waitForTimeout(1000)
  }
  await page.waitForTimeout(2500)
  console.log(`${p.padEnd(26)} -> ${page.url().replace(PANEL, "")}`)
}
await b.close()
