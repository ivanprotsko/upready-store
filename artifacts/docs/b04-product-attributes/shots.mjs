// b04-product-attributes: the acceptance screenshots, taken against the local
// stand of this branch (backend :9164, panel :5164, storefront :8164, database
// `upready_store_b04` — a clone of the migrated shop of Оксана Черкашина).
//
//   node artifacts/docs/b04-product-attributes/shots.mjs
//
// The file lives outside `apps/` on purpose: a script under `apps/storefront`
// or `apps/backend` restarts the very dev server it photographs (rule 5d).
// Playwright is required FROM the storefront, where the package actually is.
import { mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const OUT = dirname(fileURLToPath(import.meta.url))

const requireFromStorefront = createRequire(
  resolve(OUT, "../../../apps/storefront/package.json")
)
const { chromium } = requireFromStorefront("@playwright/test")

const PANEL = process.env.PANEL_URL ?? "http://localhost:5164"
const STORE = process.env.STORE_URL ?? "http://cherkashino.localhost:8164"
const EMAIL = process.env.PANEL_EMAIL ?? "owner-b04@stand.test"
const PASSWORD = process.env.PANEL_PASSWORD ?? "supersecret"

// Two products of the real catalog: the first carries six characteristics, the
// second got its volume from the variant title alone.
const CASTOR_OIL = "kastorovoe-maslo-kastorka-indiyskaya-cherkashino"
const OINTMENT = "maz-ot-varikoza-s-kashtanom-cherkashino"

mkdirSync(OUT, { recursive: true })

const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false })
  console.log(`shot ${name}.png`)
}

const main = async () => {
  const browser = await chromium.launch({ channel: "chrome" })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()

  // ---- panel, as the shop owner
  await page.goto(`${PANEL}/login`, { waitUntil: "networkidle" })
  await page.locator('input[autocomplete="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 })

  // 1. the schema screen: the default set in place, the button spent
  await page.goto(`${PANEL}/product-attributes`, { waitUntil: "networkidle" })
  await page.waitForTimeout(800)
  await shot(page, "01-panel-attributes-default-set")

  // 2. the product list with the coverage line
  await page.goto(`${PANEL}/products`, { waitUntil: "networkidle" })
  await page.waitForTimeout(1_200)
  await shot(page, "02-panel-product-list-coverage")

  // 3. one product's characteristics, filled by the backfill
  await page.goto(`${PANEL}/products`, { waitUntil: "networkidle" })
  await page.getByRole("link", { name: /Касторовое масло/ }).first().click()
  await page.waitForTimeout(2_000)
  await page.getByRole("heading", { name: "Характеристики" }).first().scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await shot(page, "03-panel-product-values")

  // ---- storefront
  const shopPage = await context.newPage()

  await shopPage.goto(`${STORE}/ru/products/${CASTOR_OIL}`, { waitUntil: "networkidle" })
  await shopPage.locator('[data-testid="product-attributes"]').scrollIntoViewIfNeeded()
  await shopPage.waitForTimeout(500)
  await shot(shopPage, "04-pdp-castor-oil")

  await shopPage.goto(`${STORE}/ru/products/${OINTMENT}`, { waitUntil: "networkidle" })
  await shopPage.locator('[data-testid="product-attributes"]').scrollIntoViewIfNeeded()
  await shopPage.waitForTimeout(500)
  await shot(shopPage, "05-pdp-ointment-volume-from-title")

  await shopPage.goto(`${STORE}/ru/store`, { waitUntil: "networkidle" })
  await shopPage.waitForTimeout(800)
  await shot(shopPage, "06-catalogue-filters")

  await shopPage.goto(`${STORE}/ru/store?a_country=thailand`, { waitUntil: "networkidle" })
  await shopPage.waitForTimeout(800)
  await shot(shopPage, "07-catalogue-country-thailand")

  await shopPage.goto(`${STORE}/ru/store?a_volume=100..500`, { waitUntil: "networkidle" })
  await shopPage.waitForTimeout(800)
  await shot(shopPage, "08-catalogue-volume-100-500")

  await shopPage.goto(`${STORE}/en/products/${CASTOR_OIL}`, { waitUntil: "networkidle" })
  await shopPage.locator('[data-testid="product-attributes"]').scrollIntoViewIfNeeded()
  await shopPage.waitForTimeout(500)
  await shot(shopPage, "09-pdp-castor-oil-en")

  await browser.close()
}

main().catch((error) => {
  console.error(String(error))
  process.exit(1)
})
