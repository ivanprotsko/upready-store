/**
 * Приёмка f09-price-editor-currencies, round 1 — независимый замер acceptor'а.
 * Стенд: панель vite :5182 и бэкенд medusa :9029 из worktree ветки PR #48.
 */
import fs from "node:fs"
import path from "node:path"
import { chromium } from "/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-price-editor-currencies/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs"

const OUT = "/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/artifacts/accept-f09-price-editor-currencies-1"
const PANEL = "http://localhost:5182"
const FIELD = "variants.0.prices.rub"

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ru-RU" })
const page = await ctx.newPage()
const errors = []
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)) })
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 200)))

const shot = async (n) => { const p = path.join(OUT, `${n}-1280x900.png`); await page.screenshot({ path: p }); return p }

await page.goto(PANEL + "/login", { waitUntil: "domcontentloaded" })
await page.fill('input[autocomplete="email"]', "f09-owner@example.test")
await page.fill('input[autocomplete="current-password"]', "supersecret")
await page.click('button[type="submit"]')
await page.waitForURL((u) => !String(u).includes("/login"), { timeout: 60000 })

// --- масштаб проблемы: сколько валют и регионов у стора (из самой панели) ---
const scale = await page.evaluate(async () => {
  const j = async (u) => (await fetch(u, { credentials: "include" })).json()
  const s = await j("/api/tenants/store").catch(() => null)
  return s
}).catch(() => null)

const headers = () => page.$$eval("[data-column-index]", (els) => {
  const seen = new Map()
  for (const el of els) {
    if (el.tagName.toLowerCase() !== "div") continue
    if (el.hasAttribute("data-row-index")) continue
    const i = Number(el.getAttribute("data-column-index"))
    if (!seen.has(i)) seen.set(i, (el.innerText || "").trim())
  }
  return [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([, t]) => t)
})
const anchorField = () => page.evaluate(() =>
  document.activeElement?.querySelector?.("[data-field]")?.getAttribute("data-field") ?? null)

async function tabsTo(field, max = 400) {
  const on = () => page.evaluate((f) => !!document.activeElement?.querySelector?.(`[data-field="${f}"]`), field)
  if (await on()) return 0
  for (let i = 1; i <= max; i++) {
    await page.keyboard.press("Tab")
    await page.waitForTimeout(50)
    if (await on()) return i
  }
  return null
}

const out = { stand: { panel: PANEL, backend: "http://localhost:9029" }, storeProbe: scale }

// ================= 1. путь от карточки товара =================
await page.goto(PANEL + "/products", { waitUntil: "domcontentloaded" })
await page.waitForTimeout(4000)
// первая строка таблицы товаров — переход в карточку (это не «клик к цене», а вход в карточку)
const firstRow = page.locator('table tbody tr a, table tbody tr').first()
await firstRow.click({ force: true })
await page.waitForURL(/\/products\/prod_/, { timeout: 60000 })
await page.waitForTimeout(3500)
const productUrl = page.url()
out.productUrl = productUrl
await shot("a1-product-card")

const clicks = []
const heading = page.locator('h1:has-text("Варианты"), h2:has-text("Варианты"), h3:has-text("Варианты")').first()
await heading.scrollIntoViewIfNeeded()
await page.waitForTimeout(600)
const dots = await page.evaluateHandle(() => {
  const h = [...document.querySelectorAll("h1,h2,h3")].find((e) => (e.innerText || "").trim() === "Варианты")
  const card = h.closest("div[class*='divide-y'], div[class*='shadow-elevation-card']") || h.parentElement.parentElement
  return [...card.querySelectorAll('button[aria-haspopup="menu"]')].slice(-1)[0]
})
await dots.asElement().click()
clicks.push("меню «…» блока «Варианты»")
await page.waitForTimeout(900)
await shot("a2-variants-menu")
await page.locator('[role="menuitem"]:has-text("Редактировать цены")').click({ force: true })
clicks.push("пункт «Редактировать цены»")
await page.waitForSelector("[data-field]", { timeout: 60000 })
await page.waitForTimeout(3000)

const gridHeaders = await headers()
const opening = await anchorField()
const rubPresent = await page.$$eval(`[data-field="${FIELD}"]`, (e) => e.length)
const tabs = await tabsTo(FIELD)
const scroller = await page.evaluate(() => {
  const el = [...document.querySelectorAll("div")].find((d) => d.scrollWidth > d.clientWidth + 5 && d.querySelector("[data-column-index]"))
  const any = [...document.querySelectorAll("div")].filter((d) => d.querySelector("[data-field]"))
  const g = el || any[0]
  return g ? { scrollWidth: g.scrollWidth, clientWidth: g.clientWidth } : null
})
const box = rubPresent ? await page.$eval(`[data-field="${FIELD}"]`, (el) => {
  const r = el.getBoundingClientRect()
  return { x: Math.round(r.x), right: Math.round(r.right), width: Math.round(r.width) }
}) : null
const shotEditor = await shot("a3-price-editor")

out.priceEditor = {
  clicks, clickCount: clicks.length, headers: gridHeaders, openingCell: opening,
  rubFieldCount: rubPresent, tabsToRub: tabs, rubBox: box,
  horizontalScrollNeeded: box ? box.right > 1280 : null, scroller,
  shot: shotEditor,
}
console.log("PRICE EDITOR:", JSON.stringify(out.priceEditor, null, 2))

// переключатель «Все валюты»
const toggle = page.locator('[data-testid="pricing-show-all-currencies"]')
const toggleCount = await toggle.count()
if (toggleCount) {
  await toggle.click({ force: true })
  await page.waitForTimeout(2500)
  const all = await headers()
  const sc = await page.evaluate(() => {
    const el = [...document.querySelectorAll("div")].find((d) => d.scrollWidth > d.clientWidth + 5 && d.querySelector("[data-column-index]"))
    return el ? { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth } : null
  })
  out.showAll = { headerCount: all.length, firstHeaders: all.slice(0, 6), scroller: sc }
  await shot("a4-all-currencies")
  await toggle.click({ force: true })
  await page.waitForTimeout(1200)
}
out.togglePresent = toggleCount > 0
console.log("SHOW ALL:", JSON.stringify(out.showAll || null))

// ================= 2. мастер создания товара =================
await page.goto(PANEL + "/products/create", { waitUntil: "domcontentloaded" })
const modal = page.locator('[role="dialog"]').last()
await modal.locator('input[name="title"]').waitFor({ timeout: 60000 })
const TITLE = "f09 ПРИЁМКА — не покупать " + process.argv[2]
await modal.locator('input[name="title"]').fill(TITLE)
for (let i = 0; i < 2; i++) {
  await modal.locator('button:has-text("Продолжить")').click({ force: true })
  await page.waitForTimeout(1500)
}
await page.waitForSelector("[data-field]", { timeout: 60000 })
await page.waitForTimeout(3000)
const wizHeaders = await headers()
const wizRub = await page.$$eval(`[data-field="${FIELD}"]`, (e) => e.length)
const wizBox = wizRub ? await page.$eval(`[data-field="${FIELD}"]`, (el) => {
  const r = el.getBoundingClientRect()
  return { x: Math.round(r.x), right: Math.round(r.right), width: Math.round(r.width) }
}) : null
const shotWiz = await shot("a5-create-variants-step")
out.createWizard = {
  headers: wizHeaders, rubFieldCount: wizRub, rubBox: wizBox,
  rubWithinViewport: wizBox ? wizBox.right <= 1280 && wizBox.x >= 0 : false, shot: shotWiz,
}
console.log("WIZARD:", JSON.stringify(out.createWizard, null, 2))

// публикация без цены
await modal.locator('[data-name="publish-button"]').click({ force: true })
await page.waitForTimeout(3500)
const msg = await page.evaluate(() => [...document.querySelectorAll("div,li,p,span")]
  .map((e) => (e.innerText || "").trim()).filter((t) => t.startsWith("Укажите цену")).slice(0, 1))
const stillWizard = page.url().includes("/products/create")
const shotRefuse = await shot("a6-publish-without-price-refused")
out.publishWithoutPrice = { refused: stillWizard, message: msg, url: page.url(), shot: shotRefuse }
console.log("PUBLISH W/O PRICE:", JSON.stringify(out.publishWithoutPrice, null, 2))

// черновик без цены — должен сохраняться
fs.writeFileSync(path.join(OUT, "measurements.json"), JSON.stringify({ ...out, consoleErrors: errors.slice(0, 10) }, null, 2))
console.log("CONSOLE ERRORS:", JSON.stringify(errors.slice(0, 10), null, 2))
await browser.close()
