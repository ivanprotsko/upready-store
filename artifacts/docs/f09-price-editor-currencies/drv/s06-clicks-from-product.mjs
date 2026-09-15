/**
 * Criterion 1, first half: how many clicks it takes from the product card to
 * the rouble price field.
 */
import { launch, login, shot, save, anchorField, PANEL } from "./lib.mjs"

const PID = process.env.PID || "prod_01M29Q5AVB4VJGSBPE2VBH02BH"
const FIELD = "variants.0.prices.rub"

const { browser, page, errors } = await launch()
await login(page)
await page.goto(`${PANEL}/products/${PID}`, { waitUntil: "domcontentloaded" })
await page.waitForTimeout(3500)
await shot(page, "s06-product-card")

const clicks = []

// The «Варианты» block sits below the fold on this card; scrolling to it is
// not a click.
const heading = page.locator('h2:has-text("Варианты"), h1:has-text("Варианты")').first()
await heading.scrollIntoViewIfNeeded()
await page.waitForTimeout(600)

// 1. the «…» menu of the «Варианты» section — the button standing just
// before «Создать» in that block's header (the two before it are the filter
// and the sort).
const dots = await page.evaluateHandle(() => {
  const h = [...document.querySelectorAll("h1,h2,h3")].find(
    (e) => (e.innerText || "").trim() === "Варианты"
  )
  const card =
    h.closest("div[class*='divide-y'], div[class*='shadow-elevation-card']") ||
    h.parentElement.parentElement
  // filter, sort, «…» — the third menu button of the block's header
  return [...card.querySelectorAll('button[aria-haspopup="menu"]')][2]
})
await dots.asElement().click()
clicks.push("меню «…» блока «Варианты»")
await page.waitForTimeout(900)
await shot(page, "s06-variants-menu")

// 2. «Редактировать цены»
await page.locator('[role="menuitem"]:has-text("Редактировать цены")').click({ force: true })
clicks.push("пункт «Редактировать цены»")

await page.waitForSelector(`[data-field="${FIELD}"]`, { timeout: 60000 })
await page.waitForTimeout(2500)
const opening = await anchorField(page)
const shotEditor = await shot(page, "s06-price-editor")

const out = {
  productId: PID,
  clicks,
  clickCount: clicks.length,
  openingCell: opening,
  reachedRubField: opening === FIELD,
  url: page.url(),
  shots: [shotEditor],
  consoleErrors: errors.slice(0, 5),
}
console.log(JSON.stringify(out, null, 2))
save("s06-clicks-from-product.json", out)
await browser.close()
