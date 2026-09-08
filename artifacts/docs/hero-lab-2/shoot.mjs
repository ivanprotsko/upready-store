#!/usr/bin/env node
/**
 * One screenshot per (brand × variant) out of the round-two hero lab, so the six blocks can be
 * looked at without keeping five stands and a browser open.
 *
 *   node artifacts/docs/hero-lab-2/serve.mjs &      # the lab must be up
 *   node artifacts/docs/hero-lab-2/shoot.mjs        # -> shot-<brand>-<variant>.png
 *   node artifacts/docs/hero-lab-2/shoot.mjs sneakers
 *   node artifacts/docs/hero-lab-2/shoot.mjs --mobile   # 390 px -> shot-<brand>-<variant>-390.png
 *
 * Each shot frames one .store node, not the lab chrome: what lands in the file is the storefront
 * as it would render, header and first product row included.
 */
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const PW = "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.mjs"
const { chromium } = await import(PW)
if (!chromium) throw new Error("playwright: chromium missing from the namespace")

const LAB = process.env.LAB || "http://localhost:8301"
const VARIANTS = ["g", "h", "j", "k", "l", "m"]
const args = process.argv.slice(2)
const mobile = args.includes("--mobile")
const only = args.find((a) => !a.startsWith("--"))

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1700, height: 1200 }, deviceScaleFactor: 2 })
await page.goto(LAB, { waitUntil: "networkidle", timeout: 30000 })
// the lab bar is sticky and would sit across the top of every element shot; unsticking it
// keeps its buttons clickable, which display:none would not
await page.addStyleTag({ content: ".bar{position:static!important}" })
if (mobile) await page.click('#seg-width button[data-v="mobile"]')

const brands = await page.$$eval("#seg-brand button", (nodes) => nodes.map((n) => n.dataset.v))
for (const brand of brands) {
  if (only && brand !== only) continue
  await page.click(`#seg-brand button[data-v="${brand}"]`)
  await page.waitForTimeout(900)
  for (const key of VARIANTS) {
    const node = page.locator(`.variant[data-key="${key}"] .store`)
    const file = join(HERE, `shot-${brand}-${key}${mobile ? "-390" : ""}.png`)
    await node.screenshot({ path: file })
    const chip = await page.locator(`#chip-${key}`).innerText()
    console.log(`${brand.padEnd(15)} ${key}  ${chip}`)
  }
}
await browser.close()
console.log(`\nfiles: ${HERE}/shot-<brand>-<variant>.png`)
