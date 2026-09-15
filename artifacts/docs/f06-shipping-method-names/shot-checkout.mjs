/**
 * Screenshots the checkout of one tenant shop at the two sizes the day's QA
 * uses (1280×900 desktop, 390×844 mobile), with a real cart: the script adds
 * the shop's first product to the basket through the storefront itself, so the
 * delivery block on the page is the one a buyer sees.
 *
 *   node shot-checkout.mjs https://cherkashino.shipshift.dev/ru ./shots after
 *
 * Playwright comes from the main checkout's node_modules (this worktree has no
 * dependency on it); the browser binaries are the ones already cached there.
 */
import { createRequire } from "node:module"
import { mkdir } from "node:fs/promises"

const require = createRequire("/Users/ivanprotsko/upready/projects/upready-store/")
const { chromium } = require("playwright")

const base = (process.argv[2] ?? "https://cherkashino.shipshift.dev/ru").replace(/\/$/, "")
const outDir = process.argv[3] ?? "./shots"
const tag = process.argv[4] ?? "checkout"

await mkdir(outDir, { recursive: true })
const browser = await chromium.launch()

for (const [size, viewport] of [
  ["1280x900", { width: 1280, height: 900 }],
  ["390x844", { width: 390, height: 844 }],
]) {
  const context = await browser.newContext({ viewport, locale: "ru-RU" })
  const page = await context.newPage()

  await page.goto(`${base}/store`, { waitUntil: "domcontentloaded", timeout: 60_000 })
  await page.locator('a[href*="/products/"]').first().click()
  await page.waitForLoadState("domcontentloaded")
  // The size/variant picker, when the product has one.
  const variant = page.locator('[data-testid="product-options"] button, button[data-testid="option-button"]').first()
  if (await variant.count()) {
    await variant.click().catch(() => {})
  }
  await page.getByTestId("add-product-button").click({ timeout: 30_000 }).catch(async () => {
    await page.locator('button:has-text("В корзину")').first().click({ timeout: 30_000 })
  })
  await page.waitForTimeout(2_000)

  await page.goto(`${base}/checkout`, { waitUntil: "networkidle", timeout: 60_000 })
  await page.waitForSelector('[data-testid="delivery-option-radio"], [data-testid="delivery-option-pickup"]', {
    timeout: 60_000,
  })
  await page.waitForTimeout(1_500)

  const file = `${outDir}/${tag}-${size}.png`
  await page.screenshot({ path: file, fullPage: false })
  console.log(`saved ${file}`)

  const options = await page
    .locator('[data-testid="delivery-option-radio"], [data-testid="delivery-option-pickup"]')
    .allInnerTexts()
  console.log(JSON.stringify({ size, options }, null, 2))
  await context.close()
}

await browser.close()
