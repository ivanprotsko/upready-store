#!/usr/bin/env node
/**
 * One screenshot per (brand × variant) out of the blocks lab, plus a second state for the two
 * galleries (after one move), so the behaviour Ivan asked for — the active strip narrowing, the
 * next one opening — is on file and not only on screen.
 *
 *   node artifacts/docs/blocks-lab/serve.mjs &      # the lab must be up
 *   node artifacts/docs/blocks-lab/shoot.mjs        # -> shot-<brand>-<variant>.png (+ -2 for ga/gb)
 *   node artifacts/docs/blocks-lab/shoot.mjs sneakers
 *   node artifacts/docs/blocks-lab/shoot.mjs --mobile   # 390 px -> shot-<brand>-<variant>-390.png
 *
 * Each shot frames one .store node, not the lab chrome. The contrast chip of every variant is
 * printed next to its file, so the run doubles as the measurement record.
 */
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const PW = "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.mjs"
const { chromium } = await import(PW)
if (!chromium) throw new Error("playwright: chromium missing from the namespace")

const LAB = process.env.LAB || "http://localhost:8302"
const VARIANTS = ["p1", "p2", "p3", "p4", "p5", "h1", "h2", "h3", "h4", "h5", "f1", "f2", "f3", "f4", "f5", "ga", "gb"]
const args = process.argv.slice(2)
const mobile = args.includes("--mobile")
const only = args.find((a) => !a.startsWith("--"))
const suffix = mobile ? "-390" : ""

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1700, height: 1200 }, deviceScaleFactor: 2 })
await page.goto(LAB, { waitUntil: "networkidle", timeout: 60000 })
await page.addStyleTag({ content: ".bar{position:static!important}" })
if (mobile) await page.click('#seg-width button[data-v="mobile"]')

const brands = await page.$$eval("#seg-brand button", (nodes) => nodes.map((n) => n.dataset.v))
for (const brand of brands) {
  if (only && brand !== only) continue
  await page.click(`#seg-brand button[data-v="${brand}"]`)
  await page.waitForTimeout(1200)
  for (const key of VARIANTS) {
    const node = page.locator(`.variant[data-key="${key}"] .store`)
    await node.screenshot({ path: join(HERE, `shot-${brand}-${key}${suffix}.png`) })
    const chip = await page.locator(`#chip-${key}`).innerText()
    console.log(`${brand.padEnd(15)} ${key.padEnd(3)} ${chip}`)
    if (key === "ga") {
      await page.locator(`.variant[data-key="ga"] [data-ga-next]`).click()
      await page.waitForTimeout(700)
      await node.screenshot({ path: join(HERE, `shot-${brand}-ga-2${suffix}.png`) })
      await page.locator(`.variant[data-key="ga"] [data-ga-prev]`).click()
    }
    if (key === "gb") {
      await page.locator(`.variant[data-key="gb"] [data-gb-strip]`).nth(2).click()
      await page.waitForTimeout(700)
      await node.screenshot({ path: join(HERE, `shot-${brand}-gb-2${suffix}.png`) })
      await page.locator(`.variant[data-key="gb"] [data-gb-strip]`).nth(0).click()
    }
  }
}
await browser.close()
console.log(`\nfiles: ${HERE}/shot-<brand>-<variant>${suffix}.png`)
