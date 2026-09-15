/**
 * The «before» half of criterion 1, measured on the SAME stand with the
 * panel source checked out at 5c147c8 (the branch head before this fix).
 * The grid moves the anchor one column per Tab press, so the count is the
 * distance from the opening cell to the rouble one.
 */
import { launch, login, shot, save, headers, tabsTo, anchorField, PANEL } from "./lib.mjs"

const PID = process.env.PID || "prod_01M29Q5AVB4VJGSBPE2VBH02BH"
const FIELD = "variants.0.prices.rub"

const { browser, page, errors } = await launch()
await login(page)
await page.goto(`${PANEL}/products/${PID}/prices`, { waitUntil: "domcontentloaded" })
await page.waitForSelector("[data-field]", { timeout: 90000 })
await page.waitForTimeout(4000)

const renderedHeaders = await headers(page)
const openingCell = await anchorField(page)
const rubVisibleAtOpen = await page.$$eval("[data-field]", (els) =>
  els.some((e) => e.getAttribute("data-field") === "variants.0.prices.rub")
)
const shotBefore = await shot(page, "s03-before-prices")
const tabs = await tabsTo(page, FIELD, 300)

const out = {
  productId: PID,
  renderedHeadersAtOpen: renderedHeaders,
  renderedHeaderCount: renderedHeaders.length,
  openingCell,
  rubRenderedAtOpen: rubVisibleAtOpen,
  tabsToField: tabs.steps,
  shot: shotBefore,
  consoleErrors: errors.slice(0, 5),
}
console.log(JSON.stringify(out, null, 2))
save("s03-before-prices.json", out)
await browser.close()
