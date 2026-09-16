import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
const req = createRequire(path.join(homedir(), "upready/projects/upready-store/node_modules/index.js"))
const { chromium } = req("playwright")
const PANEL = "https://panel-store.upready.dev", STORE = "https://cherkashino.shipshift.dev"
const SLUG = "d08-proverka-bloga"
const owner = readFileSync(path.join(homedir(), "upready/.private/upready-store-day-2026-09-16/cherkashino-owner.md"), "utf8")
const EMAIL = /E-mail владельца[^:]*:\s*(\S+)/.exec(owner)[1]
const PASSWORD = /Пароль:\s*(\S+)/.exec(owner)[1]

const b = await chromium.launch()
const page = await (await b.newContext({ locale: "ru-RU" })).newPage()
page.setDefaultTimeout(60000)
await page.goto(`${PANEL}/login`, { waitUntil: "domcontentloaded" })
await page.locator('input[name="email"]').fill(EMAIL)
await page.locator('input[name="password"]').fill(PASSWORD)
await page.locator('button[type="submit"]').click()
await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 60000 })
console.log("вошли")

for (const base of ["https://shipshift.dev", PANEL]) {
  const r = await page.request.delete(`${base}/tenants/articles/${SLUG}`)
  console.log(`DELETE ${base}/tenants/articles/${SLUG} →`, r.status(), (await r.text()).slice(0, 160))
  if (r.status() < 300) break
}

await page.goto(`${STORE}/ru/journal`, { waitUntil: "domcontentloaded" })
await page.waitForTimeout(5000)
const links = await page.locator('main a[href*="/journal/"]').evaluateAll((els) =>
  [...new Set(els.map((e) => e.getAttribute("href")))].filter((h) => h && !/\/journal\/?$/.test(h)))
console.log("лента: ссылок на статьи =", links.length, JSON.stringify(links))
console.log("лента текст:", (await page.locator("main").innerText()).slice(0, 80).replace(/\n+/g, " | "))
await page.screenshot({ path: "artifacts/docs/d08-deploy-wave6/shots/store-14-journal-after-rollback.png", fullPage: true })
const gone = await page.goto(`${STORE}/ru/journal/${SLUG}`, { waitUntil: "domcontentloaded" })
console.log("страница статьи после уборки:", gone.status())
await page.goto(`${PANEL}/journal`, { waitUntil: "domcontentloaded" })
await page.waitForTimeout(5000)
console.log("строк в журнале панели:", await page.getByTestId("article-row").count())
await page.screenshot({ path: "artifacts/docs/d08-deploy-wave6/shots/panel-09-journal-after-cleanup.png", fullPage: true })
await b.close()
