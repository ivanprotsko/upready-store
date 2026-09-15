// t15-product-attributes: the acceptance screenshots, taken against the local
// stand (backend :9152, panel :5152, storefront :8152, database
// `upready_store_t15`).
//
// Playwright drives the SYSTEM Chrome (`channel: "chrome"`) rather than the
// Docker image `tests/ui-lab` uses: the browser does start from an agent shell
// here, measured 2026-09-15, and Docker (colima) is not running on this
// machine. Nothing else about the suite is reused — this is a screenshot run,
// not a test run.
//
//   node artifacts/docs/t15-product-attributes/shots.mjs
//
// Ports and credentials come from the environment when they are not the stand
// defaults below.
import { mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const OUT = dirname(fileURLToPath(import.meta.url))

// `@playwright/test` is a dependency of apps/storefront, and this script lives
// outside any app (a file under `apps/backend` or `apps/storefront` would make
// the dev watcher restart the very server being photographed, rule 5d). So the
// package is required FROM the storefront, as CJS — which is what it is.
const requireFromStorefront = createRequire(
  resolve(OUT, "../../../apps/storefront/package.json")
)
const { chromium } = requireFromStorefront("@playwright/test")
const PANEL = process.env.PANEL_URL ?? "http://localhost:5152"
const STORE = process.env.STORE_URL ?? "http://localhost:8152"
const EMAIL = process.env.PANEL_EMAIL ?? "admin@t15shop.test"
const PASSWORD = process.env.PANEL_PASSWORD ?? "supersecret"

const CUBE_1 = "cube-1-t15shop"
const SPHERE_1 = "sphere-1-t15shop"

mkdirSync(OUT, { recursive: true })

const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false })
  console.log(`shot ${name}.png`)
}

const main = async () => {
  const browser = await chromium.launch({ channel: "chrome" })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()

  // ---- panel: log in as the shop owner
  await page.goto(`${PANEL}/login`, { waitUntil: "networkidle" })
  await page.locator('input[autocomplete="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 })

  // 1. the schema screen
  await page.goto(`${PANEL}/product-attributes`, { waitUntil: "networkidle" })
  await page.waitForTimeout(600)
  await shot(page, "01-panel-attributes-list")

  // 2. the editor of «Объём»
  await page.getByRole("link", { name: "Объём" }).click()
  await page.waitForTimeout(800)
  await shot(page, "02-panel-attribute-edit-volume")

  // 3. the product screen with the «Характеристики» section
  await page.goto(`${PANEL}/products`, { waitUntil: "networkidle" })
  await page.getByRole("link", { name: /Cube No\. 1/ }).first().click()
  await page.waitForTimeout(1_500)
  await page
    .getByRole("heading", { name: "Характеристики" })
    .first()
    .scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await shot(page, "03-panel-product-section")

  // 4. the drawer that fills them in
  await page.goto(`${page.url().split("?")[0]}/custom-attributes`, {
    waitUntil: "networkidle",
  })
  await page.waitForTimeout(1_200)
  await shot(page, "04-panel-product-values-drawer")

  // ---- storefront
  const shopPage = await context.newPage()

  await shopPage.goto(`${STORE}/ru/products/${CUBE_1}`, { waitUntil: "networkidle" })
  await shopPage.locator('[data-testid="product-attributes"]').scrollIntoViewIfNeeded()
  await shopPage.waitForTimeout(400)
  await shot(shopPage, "05-pdp-cube-1")

  await shopPage.goto(`${STORE}/ru/products/${SPHERE_1}`, { waitUntil: "networkidle" })
  await shopPage.locator('[data-testid="product-attributes"]').scrollIntoViewIfNeeded()
  await shopPage.waitForTimeout(400)
  await shot(shopPage, "06-pdp-sphere-1")

  await shopPage.goto(`${STORE}/ru/store`, { waitUntil: "networkidle" })
  await shopPage.waitForTimeout(600)
  await shot(shopPage, "07-catalogue-filters")

  await shopPage.goto(`${STORE}/ru/store?a_obem=100..500`, { waitUntil: "networkidle" })
  await shopPage.waitForTimeout(600)
  await shot(shopPage, "08-catalogue-range-100-500")

  // The «Состав» list with its counts, one value disabled by the range above.
  await shopPage.goto(`${STORE}/ru/store?a_obem=800..900`, { waitUntil: "networkidle" })
  await shopPage.waitForTimeout(400)
  await shopPage.getByRole("combobox", { name: "Состав" }).click()
  await shopPage.waitForTimeout(400)
  await shot(shopPage, "09-catalogue-facet-counts-disabled")

  await shopPage.goto(`${STORE}/en/products/${CUBE_1}`, { waitUntil: "networkidle" })
  await shopPage.locator('[data-testid="product-attributes"]').scrollIntoViewIfNeeded()
  await shopPage.waitForTimeout(400)
  await shot(shopPage, "10-pdp-cube-1-en")

  await browser.close()
}

main().catch((error) => {
  console.error(String(error))
  process.exit(1)
})
