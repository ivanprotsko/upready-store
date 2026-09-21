// Product page probe: keyboard-operable gallery, layout shift, phone buy bar, no-photo page.
//
//   BASE_URL=http://cherkashino.localhost:8121 \
//   PRODUCT=/ru/products/<handle with several photos> NO_PHOTO=/ru/products/<handle without> \
//   node apps/storefront/e2e/product-page.e2e.mjs
//   PLAYWRIGHT overrides the playwright package path.
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const PLAYWRIGHT =
  process.env.PLAYWRIGHT ||
  new URL("../../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright", import.meta.url)
    .pathname
const { chromium } = require(PLAYWRIGHT)

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:8000").replace(/\/$/, "")
const PRODUCT = process.env.PRODUCT
const NO_PHOTO = process.env.NO_PHOTO
if (!PRODUCT) throw new Error("PRODUCT is required: the path of a product with several photos")

const failures = []
const check = (ok, line) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${line}`)
  if (!ok) failures.push(line)
}

/** Sums layout shifts without recent input, the way CLS is defined. */
const observeShift = (page) =>
  page.addInitScript(() => {
    window.__cls = 0
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value
    }).observe({ type: "layout-shift", buffered: true })
  })

const browser = await chromium.launch()
try {
  // Desktop: keyboard and layout shift.
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await observeShift(desktop)
  await desktop.goto(`${BASE_URL}${PRODUCT}`, { waitUntil: "networkidle" })
  await desktop.waitForTimeout(1500)
  const cls = await desktop.evaluate(() => window.__cls)
  check(cls < 0.1, `CLS at 1440: ${cls.toFixed(4)} (limit 0.1)`)

  const second = desktop.locator('[data-testid="product-gallery-thumbnail-2"]')
  await second.focus()
  const ring = await second.evaluate((node) => {
    const style = getComputedStyle(node)
    return style.outlineStyle !== "none" || style.boxShadow !== "none"
  })
  check(ring, "a focused thumbnail shows a focus indicator")
  await desktop.keyboard.press("Enter")
  check((await second.getAttribute("aria-current")) === "true", "Enter on the second thumbnail selects it")
  await desktop.keyboard.press("ArrowRight")
  const third = desktop.locator('[data-testid="product-gallery-thumbnail-3"]')
  check((await third.getAttribute("aria-current")) === "true", "ArrowRight moves to the third photo")

  const zoom = desktop.locator('[data-testid="product-gallery-zoom"]')
  await zoom.focus()
  await desktop.keyboard.press("Enter")
  const viewer = desktop.getByRole("dialog")
  await viewer.first().waitFor({ timeout: 5000 })
  check(await viewer.first().isVisible(), "Enter on the zoom button opens the full-size viewer")
  await desktop.keyboard.press("Escape")
  await desktop.waitForTimeout(400)
  check((await viewer.count()) === 0, "Escape closes the viewer")
  check(
    await zoom.evaluate((node) => node === document.activeElement),
    "focus returns to the zoom button after the viewer closes"
  )
  await desktop.close()

  // Phone: layout shift and the buy bar above the bottom navigation.
  const phoneContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  const phone = await phoneContext.newPage()
  await observeShift(phone)
  await phone.goto(`${BASE_URL}${PRODUCT}`, { waitUntil: "networkidle" })
  await phone.waitForTimeout(1500)
  const phoneCls = await phone.evaluate(() => window.__cls)
  check(phoneCls < 0.1, `CLS at 390: ${phoneCls.toFixed(4)} (limit 0.1)`)
  const bar = phone.locator('[data-testid="mobile-actions"]')
  check(!(await bar.isVisible()), "on first paint the buy bar is not drawn (the buy box has not been scrolled past)")
  const button = phone.locator('[data-testid="add-product-button"]').first()
  await button.scrollIntoViewIfNeeded()
  await phone.waitForTimeout(400)
  check(!(await bar.isVisible()), "the buy bar stays away while the main button is on screen")
  await phone.evaluate(() => window.scrollTo(0, 1600))
  await bar.waitFor({ state: "visible", timeout: 5000 })
  await phone.waitForTimeout(400)
  const paint = await bar.evaluate((node) => {
    let opacity = 1
    for (let el = node; el; el = el.parentElement) opacity *= Number(getComputedStyle(el).opacity)
    const style = getComputedStyle(node)
    return { opacity, background: style.backgroundColor, border: style.borderTopWidth }
  })
  check(
    paint.opacity === 1 && !/rgba\(.*,\s*0(\.\d+)?\)$/.test(paint.background) && paint.border !== "0px",
    `the buy bar is opaque with a top border: opacity ${paint.opacity}, background ${paint.background}, border ${paint.border}`
  )
  const barBox = await bar.boundingBox()
  const navBox = await phone.locator("nav.fixed").first().boundingBox()
  check(
    Boolean(barBox && navBox && barBox.y + barBox.height <= navBox.y + 1),
    `the buy bar ends at ${barBox ? Math.round(barBox.y + barBox.height) : "?"}px, the bottom navigation starts at ${navBox ? Math.round(navBox.y) : "?"}px`
  )
  await phoneContext.close()

  // A product without photos keeps the two columns and shows the placeholder frame.
  if (NO_PHOTO) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto(`${BASE_URL}${NO_PHOTO}`, { waitUntil: "networkidle" })
    const frame = page.locator('[data-product-media="gallery"][data-product-media-state="placeholder"]')
    const frameBox = await frame.boundingBox()
    const buttonBox = await page.locator('[data-testid="add-product-button"]').first().boundingBox()
    check(Boolean(frameBox && frameBox.width > 300), `no-photo frame is ${frameBox ? Math.round(frameBox.width) : 0}px wide`)
    check(
      Boolean(frameBox && buttonBox && buttonBox.x > frameBox.x + frameBox.width),
      "the buy box stays in its own column to the right of the placeholder"
    )
    await page.close()
  }
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
