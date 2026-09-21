#!/usr/bin/env node
/**
 * The buyer's funnel in a real browser, with no container: catalog, product,
 * cart, checkout, up to the payment step (`t-e2e-funnel-unblock`).
 *
 *   SHOP_URL=http://supershop.localhost:8041 node e2e/funnel.e2e.mjs
 *
 * Why this file and not the Playwright suite under `tests/`: every script that
 * runs that suite starts `docker run`, and Docker is forbidden on the
 * development machine (Ivan's order 2026-09-15), so the funnel had no run at
 * all. This one drives the Chromium that Playwright already installed for the
 * host, the way `journal.e2e.mjs` does.
 *
 * It stops at the payment step on purpose. Placing the order needs a payment
 * provider that answers, and the run has to be repeatable on any stand.
 *
 * The stand needs one shop with one product in stock. `PRODUCT_HANDLE` names a
 * product; without it the script opens the first card of the catalog.
 *
 * Exit code 0 = every check passed; the log lists each check with PASS/FAIL.
 */
import { createRequire } from "node:module"
import { mkdirSync } from "node:fs"
import path from "node:path"

const require = createRequire(import.meta.url)
const PLAYWRIGHT =
  process.env.PLAYWRIGHT ||
  new URL(
    "../../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright",
    import.meta.url
  ).pathname
const { chromium } = require(PLAYWRIGHT)

const SHOP = (
  process.env.SHOP_URL || "http://supershop.localhost:8041"
).replace(/\/$/, "")
const LOCALE = process.env.LOCALE || "ru"
const PRODUCT_HANDLE = process.env.PRODUCT_HANDLE || ""
/** Optional: a directory for one screenshot per step. */
const SHOTS = process.env.SHOTS_DIR || ""
const TIMEOUT = Number(process.env.STEP_TIMEOUT_MS || "30000")

/** A payment method row, and not the error line that shares its prefix. */
const PAYMENT_METHOD =
  '[data-testid^="payment-method-"]:not([data-testid="payment-method-error-message"])'

let failures = 0
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`)
  if (!ok) failures++
}

const browser = await chromium.launch()
const context = await browser.newContext({
  locale: LOCALE,
  viewport: { width: 1280, height: 900 },
})
const page = await context.newPage()
page.setDefaultTimeout(TIMEOUT)

const pageErrors = []
page.on("pageerror", (error) => pageErrors.push(String(error)))

const shot = async (name) => {
  if (!SHOTS) return
  mkdirSync(SHOTS, { recursive: true })
  await page.screenshot({
    path: path.join(SHOTS, `${name}.png`),
    fullPage: true,
  })
}

/** A step that throws is a failed check, and the funnel stops there. */
const step = async (name, run) => {
  try {
    const detail = await run()
    check(name, true, detail || "")
    await shot(name.replace(/[^a-z0-9]+/gi, "-").toLowerCase())
    return true
  } catch (error) {
    check(name, false, String(error).split("\n")[0])
    await shot(`failed-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`)
    return false
  }
}

const steps = [
  [
    "the catalog lists a product",
    async () => {
      const response = await page.goto(`${SHOP}/${LOCALE}/store`)
      if (!response || response.status() !== 200) {
        throw new Error(`the catalog answered ${response?.status()}`)
      }
      await page.getByTestId("product-wrapper").first().waitFor()
      return `${await page.getByTestId("product-wrapper").count()} cards`
    },
  ],
  [
    "a card opens the product page",
    async () => {
      if (PRODUCT_HANDLE) {
        await page.goto(`${SHOP}/${LOCALE}/products/${PRODUCT_HANDLE}`)
      } else {
        await page.getByTestId("product-wrapper").first().click()
      }
      await page.waitForURL(/\/products\//)
      await page.getByTestId("add-product-button").first().waitFor()
      return new URL(page.url()).pathname
    },
  ],
  [
    "the product goes into the cart",
    async () => {
      // A product with options needs one value of each before the button wakes.
      const groups = page.getByTestId("product-options")
      for (let index = 0; index < (await groups.count()); index++) {
        const option = groups.nth(index).getByTestId("option-button").first()
        if (await option.isEnabled()) await option.click()
      }
      const button = page.getByTestId("add-product-button").first()
      if (!(await button.isEnabled())) {
        throw new Error(
          `the button is disabled and reads "${await button.innerText()}"`
        )
      }
      await button.click()
      // The cookie is the proof the Server Action made a cart.
      const deadline = Date.now() + TIMEOUT
      while (Date.now() < deadline) {
        const cookies = await context.cookies()
        if (cookies.some((cookie) => cookie.name === "_medusa_cart_id"))
          return "cart cookie set"
        await page.waitForTimeout(250)
      }
      throw new Error("no _medusa_cart_id cookie after the click")
    },
  ],
  [
    "the cart page shows the line",
    async () => {
      await page.goto(`${SHOP}/${LOCALE}/cart`)
      await page.getByTestId("product-row").first().waitFor()
      return `${await page.getByTestId("product-row").count()} row(s)`
    },
  ],
  [
    "the cart leads to the checkout",
    async () => {
      await page.getByTestId("checkout-button").first().click()
      await page.waitForURL(/\/checkout/)
      return new URL(page.url()).pathname + new URL(page.url()).search
    },
  ],
  [
    "the checkout reaches the payment step",
    async () => {
      // The payment section renders the place-order button for a cart that can
      // pay, and a named notice for one whose address is not filled in yet.
      const reached = page
        .getByTestId("submit-order-button")
        .or(page.getByTestId("shipping-address-incomplete"))
        .or(page.locator(PAYMENT_METHOD))
      await reached.first().waitFor()
      return `${await page.locator(PAYMENT_METHOD).count()} payment method(s)`
    },
  ],
]

for (const [name, run] of steps) {
  if (!(await step(name, run))) break
}

check(
  "no uncaught error on any page of the funnel",
  pageErrors.length === 0,
  pageErrors[0] || ""
)

await browser.close()

console.log(
  failures === 0 ? "\nFUNNEL OK" : `\nFUNNEL FAILED: ${failures} check(s)`
)
process.exit(failures === 0 ? 0 : 1)
