#!/usr/bin/env node
/**
 * t-2026-09-12-seeded-hosts-no-locale-controls: the language and currency controls of
 * every shop's header, measured in a headless Chromium on a multi-tenant stand.
 *
 *   PLAYWRIGHT_PATH=<.../playwright> PORT=8611 TAG=<before|after> \
 *     [HOSTS=acme,globex,initech,nochlavka,testovyy-magazin] [WIDTHS=1440,390] \
 *     node measure-header.mjs
 *
 * Each shop is opened on `http://<handle>.localhost:<PORT>/ru`, the storefront resolving
 * the shop from the Host header (`docs/multitenancy/storefront-by-host.md`). For every
 * host and width it records into measure-<TAG>.json:
 *   - every `nav-*` test id rendered in the header, and whether it is visible
 *   - the language control (`nav-region-select-button`) and the country/currency control
 *     (`nav-country-select-button`): present, visible, their text
 *   - on a phone, whether the bottom bar's menu carries the same two controls
 *     (`category-menu-settings`), which every layout has below 1024px
 *   - the first three product prices on the page
 * and writes shots/<TAG>-<host>-<width>.png (the first screen) and, on a phone,
 * shots/<TAG>-<host>-<width>-menu.png (the bottom bar's menu open).
 *
 * With SWITCH=<host> it also opens that shop on /en (SWITCH_WIDTH wide, 1440 by default),
 * picks Russia and Russian in the dialog behind the header's currency control, and records
 * where the page lands and the prices it then shows: the "switching to RUB/ru works" half
 * of the acceptance.
 */
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? "playwright")

const PORT = process.env.PORT ?? "8611"
const TAG = process.env.TAG ?? "stand"
const HOSTS = (process.env.HOSTS ?? "acme,globex,initech,nochlavka,testovyy-magazin").split(",")
const WIDTHS = (process.env.WIDTHS ?? "1440,390").split(",").map(Number)
const SWITCH = process.env.SWITCH ?? ""
const SWITCH_WIDTH = Number(process.env.SWITCH_WIDTH ?? 1440)
const SHOTS = path.join(HERE, "shots")

const origin = (host) => `http://${host}.localhost:${PORT}`

fs.mkdirSync(SHOTS, { recursive: true })
const browser = await chromium.launch()

const control = async (page, testId) => {
  const all = page.locator(`[data-testid="${testId}"]`)
  const count = await all.count()
  let visible = 0
  const texts = []
  for (let i = 0; i < count; i += 1) {
    if (await all.nth(i).isVisible()) {
      visible += 1
      texts.push((await all.nth(i).innerText()).trim())
    }
  }
  return { count, visible, texts }
}

const prices = (page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="product-wrapper"]'))
      .slice(0, 3)
      .map((card) => {
        const price = card.querySelector('[data-testid="price"], [data-testid="product-price"]')
        return (price ?? card).textContent.replace(/\s+/g, " ").trim().match(/[^ ]*[\d][\d\s.,]*[^ ]*/g)?.join(" ") ?? ""
      })
  )

const headerIds = (page) =>
  page.evaluate(() => {
    const seen = new Map()
    for (const el of document.querySelectorAll('[data-testid^="nav-"]')) {
      const id = el.getAttribute("data-testid")
      const box = el.getBoundingClientRect()
      const shown = box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== "hidden"
      seen.set(id, (seen.get(id) ?? false) || shown)
    }
    return Object.fromEntries(seen)
  })

const runs = []
for (const host of HOSTS) {
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: width < 1024 ? 844 : 900 },
      locale: "ru-RU",
    })
    const page = await context.newPage()
    const response = await page.goto(`${origin(host)}/ru`, { waitUntil: "networkidle" })
    const run = {
      host,
      width,
      url: page.url(),
      status: response?.status(),
      header: await headerIds(page),
      language: await control(page, "nav-region-select-button"),
      currency: await control(page, "nav-country-select-button"),
      prices: await prices(page),
      shot: `shots/${TAG}-${host}-${width}.png`,
    }
    await page.screenshot({ path: path.join(HERE, run.shot) })

    if (width < 1024) {
      const menuButton = page.locator("nav.fixed.bottom-0 button").first()
      if (await menuButton.count()) {
        await menuButton.click()
        const settings = page.locator('[data-testid="category-menu-settings"]')
        await settings.waitFor({ state: "visible", timeout: 5000 }).catch(() => {})
        run.menu = {
          settingsVisible: await settings.isVisible(),
          language: await control(page, "nav-region-select-button"),
          currency: await control(page, "nav-country-select-button"),
          shot: `shots/${TAG}-${host}-${width}-menu.png`,
        }
        await page.screenshot({ path: path.join(HERE, run.menu.shot) })
      } else {
        run.menu = { bottomNav: false }
      }
    }
    runs.push(run)
    console.log(
      `${host} ${width}: header controls language ${run.language.visible}/${run.language.count}, currency ${run.currency.visible}/${run.currency.count}` +
        (run.menu ? `; menu language ${run.menu.language?.visible ?? 0}, currency ${run.menu.currency?.visible ?? 0}` : "") +
        `; prices ${run.prices.join(" | ")}`
    )
    await context.close()
  }
}

let switched = null
if (SWITCH) {
  const context = await browser.newContext({
    viewport: { width: SWITCH_WIDTH, height: SWITCH_WIDTH < 1024 ? 844 : 900 },
    locale: "en-US",
  })
  const page = await context.newPage()
  await page.goto(`${origin(SWITCH)}/en`, { waitUntil: "networkidle" })
  const before = { url: page.url(), currency: await control(page, "nav-country-select-button"), prices: await prices(page) }
  await page.locator('[data-testid="nav-country-select-button"]:visible').first().click()
  await page.locator('label[for="region-country-ru"]').click()
  await page.locator('label[for="region-language-ru"]').click()
  await page.screenshot({ path: path.join(HERE, `shots/${TAG}-${SWITCH}-${SWITCH_WIDTH}-switch-dialog.png`) })
  await Promise.all([
    page.waitForURL(/\/ru(\/|$)/, { timeout: 30000 }),
    page.getByRole("button", { name: /apply|применить/i }).click(),
  ])
  await page.waitForLoadState("networkidle")
  const after = {
    url: page.url(),
    language: await control(page, "nav-region-select-button"),
    currency: await control(page, "nav-country-select-button"),
    prices: await prices(page),
    shot: `shots/${TAG}-${SWITCH}-${SWITCH_WIDTH}-switched.png`,
  }
  await page.screenshot({ path: path.join(HERE, after.shot) })
  switched = { host: SWITCH, width: SWITCH_WIDTH, before, after }
  console.log(`switch ${SWITCH} ${SWITCH_WIDTH}: ${before.url} ${before.currency.texts} ${before.prices.join(" | ")} → ${after.url} ${after.language.texts} ${after.currency.texts} ${after.prices.join(" | ")}`)
  await context.close()
}

await browser.close()
fs.writeFileSync(
  path.join(HERE, `measure-${TAG}.json`),
  JSON.stringify({ tag: TAG, port: PORT, measuredAt: new Date().toISOString(), runs, switched }, null, 2) + "\n"
)
