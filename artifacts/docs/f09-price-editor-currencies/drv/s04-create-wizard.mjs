/**
 * Criteria 2 and 3: the create wizard's «Варианты» step has a price field in
 * the shop's currency without scrolling, and publishing a product with no
 * price at all is refused with a message in Russian instead of landing a
 * priceless card in the catalogue.
 *
 * The panel mounts the route modal twice in dev, so every locator is scoped
 * to the LAST `[role=dialog]` — the one on top — and clicks are forced, since
 * radix marks both of them `aria-hidden` when they cover each other.
 */
import { launch, login, shot, save, headers, anchorField, PANEL } from "./lib.mjs"

const FIELD = "variants.0.prices.rub"
const TITLE = "f09 — проверка цены " + (process.argv[2] || "")

const { browser, page, errors } = await launch()
await login(page)

await page.goto(`${PANEL}/products/create`, { waitUntil: "domcontentloaded" })
const modal = page.locator('[role="dialog"]').last()
await modal.locator('input[name="title"]').waitFor({ timeout: 60000 })
await modal.locator('input[name="title"]').fill(TITLE)

const next = async () => {
  await modal.locator('button:has-text("Продолжить")').click({ force: true })
  await page.waitForTimeout(1200)
}
await next() // details -> organize
await next() // organize -> variants
await page.waitForSelector("[data-field]", { timeout: 60000 })
await page.waitForTimeout(2500)

const wizardHeaders = await headers(page)
const rubFieldCount = await page.$$eval(`[data-field="${FIELD}"]`, (els) => els.length)
const openingCell = await anchorField(page)
const box = await page.$eval(`[data-field="${FIELD}"]`, (el) => {
  const r = el.getBoundingClientRect()
  return { x: Math.round(r.x), right: Math.round(r.right), width: Math.round(r.width) }
})
const shotWizard = await shot(page, "s04-create-variants-step")

// Publish with no price at all.
await modal.locator('[data-name="publish-button"]').click({ force: true })
await page.waitForTimeout(3000)
const toastText = await page.evaluate(() =>
  [...document.querySelectorAll("div,li,p,span")]
    .map((e) => (e.innerText || "").trim())
    .filter((t) => t.startsWith("Укажите цену"))
    .slice(0, 1)
)
const stillOnWizard = page.url().includes("/products/create")
const shotRefused = await shot(page, "s04-publish-without-price-refused")

// Now type a price and publish for real.
await page.click(`[data-field="${FIELD}"]`, { force: true })
await page.keyboard.type("1234")
await page.keyboard.press("Enter")
await page.waitForTimeout(600)
await modal.locator('[data-name="publish-button"]').click({ force: true })
await page.waitForTimeout(8000)

const out = {
  title: TITLE,
  wizardHeaders,
  rubFieldCount,
  openingCell,
  rubFieldBox: box,
  rubWithinViewport: box.right <= 1280,
  publishWithoutPrice: { refused: stillOnWizard, message: toastText },
  publishWithPrice: {
    leftTheWizard: !page.url().includes("/products/create"),
    url: page.url(),
  },
  shots: { variantsStep: shotWizard, refused: shotRefused },
  consoleErrors: errors.slice(0, 5),
}
console.log(JSON.stringify(out, null, 2))
save("s04-create-wizard.json", out)
await browser.close()
