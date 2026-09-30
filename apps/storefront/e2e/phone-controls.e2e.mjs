// Phone controls probe: at 390px a visitor must reach theme, language and country.
//
// Most headers hide all three below 1024px, so they live in the bottom navigation (theme)
// and in the category menu it opens (language + country dialog, theme). The probe taps
// them the way a finger does; a control that is in the DOM but covered fails the tap.
//
//   BASE_URL=http://cherkashino.localhost:8121 node apps/storefront/e2e/phone-controls.e2e.mjs
//   PATH_NAME overrides /ru/store, PLAYWRIGHT overrides the playwright package path.
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const PLAYWRIGHT =
  process.env.PLAYWRIGHT ||
  new URL("../../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright", import.meta.url)
    .pathname
const { chromium } = require(PLAYWRIGHT)

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:8000").replace(/\/$/, "")
const PATH_NAME = process.env.PATH_NAME ?? "/ru/store"
const failures = []
const check = (ok, line) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${line}`)
  if (!ok) failures.push(line)
}

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
})
const page = await context.newPage()
const mode = () => page.evaluate(() => document.documentElement.dataset.mode)

try {
  await page.goto(`${BASE_URL}${PATH_NAME}`, { waitUntil: "networkidle" })

  const before = await mode()
  await page.locator('[data-testid="bottom-nav-mode-toggle"]').tap({ timeout: 5000 })
  await page.waitForTimeout(300)
  check((await mode()) !== before, `theme toggle in the bottom navigation: ${before} -> ${await mode()}`)

  await page.locator("nav.fixed button").first().tap({ timeout: 5000 })
  const row = page.locator('[data-testid="category-menu-settings"]')
  await row.waitFor({ timeout: 5000 })
  check(await row.isVisible(), "settings row is visible in the category menu")

  const inMenu = await mode()
  await page.locator('[data-testid="category-menu-mode-toggle"]').tap({ timeout: 5000 })
  await page.waitForTimeout(300)
  check((await mode()) !== inMenu, `theme toggle in the menu: ${inMenu} -> ${await mode()}`)

  await row.locator("button").first().tap({ timeout: 5000 })
  const dialog = page.locator('[role="dialog"]').filter({ has: page.getByRole("radio") })
  await dialog.getByRole("radio").first().waitFor({ timeout: 5000 })
  const radios = await dialog.getByRole("radio").count()
  check(radios > 2, `language and country dialog opens above the menu with ${radios} choices`)
  const box = await dialog.getByRole("radio").first().boundingBox()
  const onTop = box
    ? await page.evaluate(
        ({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('[role="dialog"]')),
        { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      )
    : false
  check(onTop, "the dialog's first choice is the topmost element at its own position")
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
