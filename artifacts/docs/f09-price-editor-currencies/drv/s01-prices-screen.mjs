/**
 * Criterion 1: «Редактировать цены» opens on the shop's own currency —
 * the field is visible with no horizontal scrolling and is <= 2 Tab presses
 * away. Control: the «Все валюты» switch puts the other 357 columns back.
 */
import { launch, login, shot, save, headers, tabsTo, anchorField, PANEL } from "./lib.mjs"

const PID = process.env.PID || "prod_01M29Q5AVB4VJGSBPE2VBH02BH"
const FIELD = "variants.0.prices.rub"

const { browser, page, errors } = await launch()
await login(page)

await page.goto(`${PANEL}/products/${PID}/prices`, { waitUntil: "domcontentloaded" })
await page.waitForSelector(`input[name="${FIELD}"]`, { timeout: 60000 })

const narrowHeaders = await headers(page)

// The cell is reachable without scrolling the grid sideways.
const box = await page.$eval(`input[name="${FIELD}"]`, (el) => {
  const r = el.getBoundingClientRect()
  const scroller = el.closest("[data-container]") || document.scrollingElement
  return {
    x: Math.round(r.x),
    right: Math.round(r.right),
    scrollLeft: scroller ? scroller.scrollLeft : 0,
    scrollWidth: scroller ? scroller.scrollWidth : 0,
    clientWidth: scroller ? scroller.clientWidth : 0,
  }
})

await page.waitForTimeout(2000)
const openingCell = await anchorField(page)
const tabs = await tabsTo(page, FIELD, 40)
const shotNarrow = await shot(page, "s01-prices-shop-currency")

// Control: the switch restores the full Admin set.
await page.click('[data-testid="pricing-show-all-currencies"]')
await page.waitForTimeout(1500)
const allHeaders = await headers(page)
// Horizontally virtualised: only the columns at the left edge are in the DOM,
// so the size of the full set is read from the scroller instead of counted.
const allWidth = await page.$eval("[data-container]", (el) => ({
  scrollWidth: el.scrollWidth,
  clientWidth: el.clientWidth,
}))
const shotAll = await shot(page, "s01-prices-all-currencies")

const out = {
  productId: PID,
  field: FIELD,
  narrow: {
    headers: narrowHeaders,
    columnCount: narrowHeaders.length,
    openingCell,
    tabsToField: tabs.steps,
    fieldBox: box,
    horizontalScrollNeeded: box.scrollWidth > box.clientWidth + 1,
    fieldWithinViewport: box.right <= 1280,
  },
  showAll: {
    // horizontally virtualised: the count is what the grid renders at the
    // left edge, not the total, so the total is reported from the API instead.
    renderedHeaders: allHeaders.length,
    firstHeaders: allHeaders.slice(0, 6),
    scroller: allWidth,
  },
  shots: { narrow: shotNarrow, all: shotAll },
  consoleErrors: errors,
}
console.log(JSON.stringify(out, null, 2))
save("s01-prices-screen.json", out)
await browser.close()
