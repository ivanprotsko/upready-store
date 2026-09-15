/**
 * Regression check: the narrowed grid hides no price. Editing the rouble
 * price of a product that also has a USD one must send BOTH back — hidden
 * columns are a display choice, the form still carries their values.
 */
import { launch, login, save, PANEL, BACKEND } from "./lib.mjs"
import fs from "node:fs"

const PID = "prod_01M29Q5B2NGA743RN8XYN5EVCE"
const TOKEN = fs
  .readFileSync(
    "/private/tmp/claude-502/-Users-ivanprotsko-upready-worktrees-b29f7dd2-d35c-442d-9636-3c55da1eccf7-fix-day16-price-editor-currencies/a41b4668-8e7d-4b24-9711-60687b6bcd11/scratchpad/token.txt",
    "utf8"
  )
  .trim()

const prices = async () => {
  const r = await fetch(`${BACKEND}/tenants/products/${PID}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  const d = await r.json()
  return (d.product.variants[0].prices || [])
    .map((p) => `${p.currency_code}:${p.amount}`)
    .sort()
}

const before = await prices()

const { browser, page, errors } = await launch()
await login(page)
await page.goto(`${PANEL}/products/${PID}/prices`, { waitUntil: "domcontentloaded" })
await page.waitForSelector('[data-field="variants.0.prices.rub"]', { timeout: 60000 })
await page.waitForTimeout(2500)

const headersSeen = await page.$$eval("[data-field]", (els) =>
  els.map((e) => e.getAttribute("data-field"))
)

// Enter opens the cell for editing; the caret lands after the old value, so
// it is selected (macOS Meta+A) before the new one is typed.
await page.click('[data-field="variants.0.prices.rub"]', { force: true })
await page.keyboard.press("Enter")
await page.keyboard.press("Meta+a")
await page.keyboard.type("1355")
await page.keyboard.press("Enter")
await page.waitForTimeout(400)
await page.locator('button:has-text("Сохранить")').last().click({ force: true })
await page.waitForTimeout(6000)

const after = await prices()
const out = {
  productId: PID,
  fieldsInGrid: headersSeen,
  pricesBefore: before,
  pricesAfter: after,
  usdSurvived: after.some((p) => p.startsWith("usd:")),
  rubChanged: JSON.stringify(before) !== JSON.stringify(after),
  consoleErrors: errors.slice(0, 5),
}
console.log(JSON.stringify(out, null, 2))
save("s05-edit-keeps-other-currency.json", out)
await browser.close()
