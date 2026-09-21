// Catalog filters probe: sidebar groups, chips and reset at 1440; button, badge and sheet at 390.
//
//   BASE_URL=http://cherkashino.localhost:8121 node apps/storefront/e2e/catalog-filters.e2e.mjs
//   PATH_NAME overrides /ru/store, SHOTS=<dir> keeps screenshots, PLAYWRIGHT overrides the package path.
import { createRequire } from "node:module"
import { join } from "node:path"

const require = createRequire(import.meta.url)
const PLAYWRIGHT =
  process.env.PLAYWRIGHT ||
  new URL("../../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright", import.meta.url)
    .pathname
const { chromium } = require(PLAYWRIGHT)

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:8000").replace(/\/$/, "")
const PATH_NAME = process.env.PATH_NAME ?? "/ru/store"
const SHOTS = process.env.SHOTS
const failures = []
const check = (ok, line) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${line}`)
  if (!ok) failures.push(line)
}
const total = (page) =>
  page.evaluate(() => {
    const list = document.querySelector('[data-testid="products-list"]')
    return list ? Number(list.getAttribute("data-total-count")) : null
  })

const browser = await chromium.launch()
let filteredUrl = null
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(`${BASE_URL}${PATH_NAME}`, { waitUntil: "networkidle" })
  const sidebar = page.locator('[data-testid="filter-sidebar"]')
  check(await sidebar.isVisible(), "the filter sidebar is visible at 1440")

  const titles = await sidebar.locator("summary > span:first-child").allInnerTexts()
  const names = titles.map((title) => title.split(":")[0].split(",")[0].trim().toLowerCase())
  check(new Set(names).size === names.length, `no duplicate facets: ${titles.join(" | ")}`)
  const single = await sidebar.locator("details").evaluateAll((groups) =>
    groups.filter((group) => group.querySelectorAll('input[type="checkbox"]').length === 1).length
  )
  check(single === 0, `groups with a single checkbox: ${single}`)
  const range = titles.find((title) => /\d/.test(title) && title.includes(":"))
  check(Boolean(range), `a range is labelled in words: ${range ?? "none found"}`)

  const before = await total(page)
  const counted = sidebar.locator("label:has(span.tabular-nums) input:not([disabled])").first()
  await counted.click()
  await page.waitForURL(/[?&]a_/, { timeout: 10000 })
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(500)
  filteredUrl = page.url()
  const after = await total(page)
  check(after !== null && before !== null && after > 0 && after < before, `a checkbox narrows the list: ${before} -> ${after}`)
  const chips = page.locator('[data-testid="active-filter-chip"]')
  check((await chips.count()) === 1, `one chip for the chosen value: "${(await chips.allInnerTexts()).join(", ")}"`)
  if (SHOTS) await page.screenshot({ path: join(SHOTS, "filters-1440-chip.png") })

  await page.locator('[data-testid="active-filters-reset"]').click()
  await page.waitForURL((url) => !/[?&]a_/.test(url.search), { timeout: 10000 })
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(500)
  check((await chips.count()) === 0 && (await total(page)) === before, "reset removes the chip and restores the full list")
  await page.close()

  // Phone: one labelled button with a badge, the sheet, the sticky «show results» button.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const phone = await context.newPage()
  await phone.goto(filteredUrl ?? `${BASE_URL}${PATH_NAME}`, { waitUntil: "networkidle" })
  const button = phone.locator('[data-testid="mobile-filters-button"]')
  check(await button.isVisible(), `the phone shows one filters button: "${(await button.innerText()).replace(/\s+/g, " ")}"`)
  check((await phone.locator('[data-testid="mobile-filters-count"]').innerText()) === "1", "the button carries the number of chosen filters")
  check(!(await phone.locator('[data-testid="filter-sidebar"]').isVisible()), "the sidebar is not shown on the phone")
  const firstCard = await phone.locator('[data-testid="product-wrapper"]').first().boundingBox()
  check(Boolean(firstCard && firstCard.y < 844), `the first card starts at ${firstCard ? Math.round(firstCard.y) : "?"}px, inside the first screen`)
  await button.tap()
  const show = phone.locator('[data-testid="mobile-filters-show"]')
  await show.waitFor({ timeout: 5000 })
  await phone.waitForTimeout(1200)
  const showText = await show.innerText()
  check(/\d/.test(showText), `the sheet's sticky button says how many products are left: "${showText}"`)
  const showBox = await show.boundingBox()
  check(Boolean(showBox && showBox.y + showBox.height <= 844), "the sticky button is inside the viewport")
  if (SHOTS) await phone.screenshot({ path: join(SHOTS, "filters-390-sheet.png") })
  await context.close()
} catch (error) {
  failures.push(String(error).split("\n")[0])
} finally {
  await browser.close()
}

if (failures.length) {
  console.error(`FAILED: ${failures.length} failure(s)`)
  for (const failure of failures) console.error(` - ${failure}`)
  process.exit(1)
}
console.log("PASSED: 0 failure(s)")
