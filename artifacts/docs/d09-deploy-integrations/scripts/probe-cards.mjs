/**
 * d09 — уточняющий замер трёх мест, где первый прогон дал не результат, а
 * состояние загрузки или артефакт нарезки текста:
 *   1. карточка Wildberries: дождаться конца пробы ключа и снять права/срок;
 *   2. карточка СДЭК: нарезать по ЗАГОЛОВКУ карточки, а не по первому
 *      вхождению слова (оно стоит внутри фразы ApiShip «…считает СДЭК напрямую»);
 *   3. /settings/marketplaces — хаб отдал пустой текст.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { execSync } from "node:child_process"

const roots = [
  path.join(homedir(), "upready/projects/upready-store/node_modules"),
  (() => { try { return execSync("npm root -g", { encoding: "utf8" }).trim() } catch { return "" } })(),
].filter(Boolean)
let chromium = null
for (const root of roots) {
  try { chromium = createRequire(path.join(root, "index.js"))("playwright").chromium; if (chromium) break } catch {}
}
if (!chromium) throw new Error("playwright: chromium не найден")

const PANEL = "https://panel-store.upready.dev"
const SHOTS = "artifacts/docs/d09-deploy-integrations/shots"
mkdirSync(SHOTS, { recursive: true })
const owner = readFileSync(path.join(homedir(), "upready/.private/upready-store-day-2026-09-16/cherkashino-owner.md"), "utf8")
const EMAIL = /E-mail владельца[^:]*:\s*(\S+)/.exec(owner)[1]
const PASS = /Пароль:\s*(\S+)/.exec(owner)[1]

const visibleText = (page) => page.evaluate(() => {
  const parts = [document.body.innerText]
  for (const el of document.querySelectorAll("input, textarea")) {
    const masked = el.type === "password" || getComputedStyle(el).webkitTextSecurity === "disc"
    if (!masked) parts.push(el.value ?? "")
  }
  return parts.join("\n")
})
const shot = async (page, name) => {
  const seen = await visibleText(page)
  if (PASS.length >= 8 && seen.includes(PASS)) throw new Error(`УТЕЧКА пароля на кадре ${name}`)
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
  return seen
}

const run = async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ru-RU" })
  const page = await ctx.newPage()
  const out = {}

  await page.goto(`${PANEL}/login`, { waitUntil: "domcontentloaded" })
  await page.locator('input[name="email"]').fill(EMAIL)
  await page.locator('input[name="password"]').fill(PASS)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 45000 })

  // 1. список: ждём, пока НИ ОДНА карточка не «спрашивает»
  await page.goto(`${PANEL}/settings/integrations`, { waitUntil: "domcontentloaded" })
  let text = ""
  const t0 = Date.now()
  while (Date.now() - t0 < 90000) {
    text = await visibleText(page)
    if (/Wildberries/.test(text) && !/спрашива|Загрузка…/i.test(text)) break
    await page.waitForTimeout(3000)
  }
  out.ждалиСпискаСек = Math.round((Date.now() - t0) / 1000)
  out.осталосьСпрашивает = /спрашива|Загрузка…/i.test(text)
  await shot(page, "05-integrations-settled-1280x900")

  /** Нарезка по ЗАГОЛОВКУ карточки: имя службы, стоящее в начале строки. */
  const lines = text.split("\n").map((s) => s.trim())
  const card = (name) => {
    const i = lines.findIndex((l) => l === name)
    if (i < 0) return "(заголовка карточки нет)"
    const j = lines.indexOf("Открыть", i)
    return lines.slice(i, j < 0 ? i + 8 : j + 1).filter(Boolean).join(" | ")
  }
  for (const n of ["Wildberries", "Ozon", "Robokassa", "ApiShip", "СДЭК"]) out[`карточка:${n}`] = card(n)

  // 2. карточка Wildberries отдельной страницей — права и срок
  await page.goto(`${PANEL}/settings/integrations/wildberries`, { waitUntil: "domcontentloaded" })
  const t1 = Date.now()
  let wb = ""
  while (Date.now() - t1 < 90000) {
    wb = await visibleText(page)
    if (/Wildberries/.test(wb) && !/спрашива|Загрузка…|проверя/i.test(wb)) break
    await page.waitForTimeout(3000)
  }
  await shot(page, "06-wildberries-card-settled-1280x900")
  out.wbСтраница = wb.split("\n").map((s) => s.trim()).filter(Boolean).slice(-28).join(" | ")
  out.wbПраваУпомянуты = /прав|доступ|scope|катего/i.test(wb)
  out.wbСрокУпомянут = /до \d|истека|годен|срок|\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2}/i.test(wb)

  // 3. хаб /settings/marketplaces
  await page.goto(`${PANEL}/settings/marketplaces`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(8000)
  const hub = await shot(page, "07-marketplaces-hub-1280x900")
  out.хабUrl = page.url().replace(PANEL, "")
  out.хабТекст = hub.split("\n").map((s) => s.trim()).filter(Boolean).slice(-20).join(" | ")

  await browser.close()
  writeFileSync("artifacts/docs/d09-deploy-integrations/probe-cards.json", JSON.stringify(out, null, 2) + "\n")
  for (const [k, v] of Object.entries(out)) console.log(`${k} = ${JSON.stringify(v)}`)
}
run().catch((e) => { console.error("ОШИБКА:", e.message); process.exit(1) })
