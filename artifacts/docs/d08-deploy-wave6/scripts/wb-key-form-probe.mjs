import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
const { chromium } = createRequire(path.join(homedir(), "upready/projects/upready-store/node_modules/index.js"))("playwright")
const PANEL = "https://panel-store.upready.dev"
const owner = readFileSync(path.join(homedir(), "upready/.private/upready-store-day-2026-09-16/cherkashino-owner.md"), "utf8")
const b = await chromium.launch()
const page = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "ru-RU" })).newPage()
page.setDefaultTimeout(60000)
await page.goto(`${PANEL}/login`, { waitUntil: "domcontentloaded" })
await page.locator('input[name="email"]').fill(/E-mail владельца[^:]*:\s*(\S+)/.exec(owner)[1])
await page.locator('input[name="password"]').fill(/Пароль:\s*(\S+)/.exec(owner)[1])
await page.locator('button[type="submit"]').click()
await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 60000 })
for (const route of ["/settings/wildberries", "/settings/ozon", "/settings/marketplaces"]) {
  const r = await page.goto(`${PANEL}${route}`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(4000)
  const text = await page.locator("main, body").first().innerText()
  console.log(`### ${route} → ${page.url()} (HTTP ${r.status()})`)
  console.log("   полей ввода ключа:", await page.locator('input[type="password"], input[name*="token"], input[id*="token"], input[id*="key"]').count())
  console.log("   testid'ы на странице:", JSON.stringify((await page.evaluate(() => [...document.querySelectorAll("[data-testid]")].map(e => e.dataset.testid))).filter(t => /wb|ozon|key|token|marketplace/i.test(t)).slice(0, 14)))
  console.log("   «не сохранён»/«не задан»:", /не сохран|не задан|не подключ/i.test(text))
  console.log("   фрагмент:", (text.match(/Ключ API[\s\S]{0,320}/) ?? ["—"])[0].replace(/\n+/g, " | "))
  await page.screenshot({ path: `artifacts/docs/d08-deploy-wave6/shots/panel-wb-${route.split("/").pop()}.png`, fullPage: true })
}
await b.close()
