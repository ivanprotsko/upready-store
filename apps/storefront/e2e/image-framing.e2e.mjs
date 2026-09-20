// Image framing probe: is every product photo shown whole, in one frame, on an even grid?
//
// For a given shop it walks home, the catalog, a category, a product page and that page's
// related grid, the way a visitor does (by clicking, not by deep link), at 1440 and at 390, and
// prints per product image the natural ratio, the frame ratio, `object-fit` and whether any of
// the picture is clipped, and per grid row the card heights.
//
// It FAILS (exit 1) when
//   - a product image is clipped (cover into a box of another ratio, or an image overflowing
//     a frame that hides overflow),
//   - the frames inside one grid differ in aspect ratio,
//   - the cards inside one grid row differ in height.
//
//   BASE_URL=http://cherkashino.localhost:8121 node apps/storefront/e2e/image-framing.e2e.mjs
//
// Options (environment):
//   BASE_URL   origin of the shop (required)
//   LOCALE     locale segment to enter through (default ru)
//   MODE       light | dark | both (default light); dark is reached by pressing the toggle
//   SHOTS      directory for full-page screenshots; none are taken without it
//   SHOT_TAG   prefix for the screenshot file names (default "shot"), e.g. before / after
//   PLAYWRIGHT path to the playwright package, when it is not in the workspace store
//
// What counts as a product image: anything inside a `[data-product-media]` frame (the one media
// frame every product picture goes through), plus, so the probe can also measure a build that
// predates the frame, the pictures inside product cards and the product gallery.

import { createRequire } from "node:module"
import { mkdirSync } from "node:fs"
import path from "node:path"

const require = createRequire(import.meta.url)
const PLAYWRIGHT =
  process.env.PLAYWRIGHT ||
  new URL("../../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright", import.meta.url)
    .pathname
const { chromium } = require(PLAYWRIGHT)

const BASE_URL = (process.env.BASE_URL || "").replace(/\/$/, "")
if (!BASE_URL) {
  console.error("BASE_URL is required, for example http://cherkashino.localhost:8121")
  process.exit(2)
}
const LOCALE = process.env.LOCALE || "ru"
const MODES = (process.env.MODE || "light") === "both" ? ["light", "dark"] : [process.env.MODE || "light"]
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null
const SHOT_TAG = process.env.SHOT_TAG || "shot"
const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
]

const failures = []
const fail = (where, message) => {
  failures.push(`${where}: ${message}`)
  console.log(`  FAIL ${message}`)
}

/** Runs in the page. Returns the measured images and the card rows of every grid. */
const measure = () => {
  const round = (n) => Math.round(n * 1000) / 1000
  const MEDIA =
    '[data-product-media] img, [data-testid="product-wrapper"] img, [data-testid="image-gallery"] img, [data-testid="product-gallery"] img'

  const frameOf = (img) => {
    const marked = img.closest("[data-product-media]")
    if (marked) return marked
    // Before the shared frame existed: the nearest ancestor that hides overflow is the frame.
    let node = img.parentElement
    while (node && node !== document.body) {
      const style = getComputedStyle(node)
      if (style.overflow !== "visible" || style.aspectRatio !== "auto") return node
      node = node.parentElement
    }
    return img.parentElement
  }

  const images = [...new Set(document.querySelectorAll(MEDIA))]
    .filter((img) => {
      const rect = img.getBoundingClientRect()
      const style = getComputedStyle(img)
      return rect.width > 1 && rect.height > 1 && style.visibility !== "hidden" && Number(style.opacity) > 0
    })
    .map((img) => {
      const box = img.getBoundingClientRect()
      const frame = frameOf(img)
      const frameBox = frame.getBoundingClientRect()
      const fit = getComputedStyle(img).objectFit
      const natural = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : null
      const boxRatio = box.width / box.height
      // `cover` (and `none`) cut whatever does not fit the box; `contain` and `scale-down`
      // never do; `fill` distorts instead of cutting, which is reported as clipped too.
      const cutByFit =
        natural !== null && fit !== "contain" && fit !== "scale-down" && Math.abs(natural - boxRatio) / natural > 0.02
      const hidesOverflow = getComputedStyle(frame).overflow !== "visible"
      const overflows =
        hidesOverflow &&
        (box.left < frameBox.left - 1 ||
          box.top < frameBox.top - 1 ||
          box.right > frameBox.right + 1 ||
          box.bottom > frameBox.bottom + 1)
      return {
        src: (img.currentSrc || img.src).split("/").pop().slice(0, 48),
        loaded: img.complete && img.naturalWidth > 0,
        natural: natural === null ? null : round(natural),
        frame: round(frameBox.width / frameBox.height),
        fit,
        clipped: cutByFit || overflows,
        grid: img.closest("ul, [data-product-grid]") ? [...document.querySelectorAll("ul, [data-product-grid]")].indexOf(img.closest("ul, [data-product-grid]")) : -1,
      }
    })

  const grids = [...document.querySelectorAll("ul, [data-product-grid]")]
    .map((grid, index) => {
      const cards = [...grid.children].filter((child) => child.querySelector('[data-testid="product-wrapper"]'))
      if (!cards.length) return null
      const rows = new Map()
      for (const card of cards) {
        const rect = card.getBoundingClientRect()
        if (rect.width < 1) continue
        const top = Math.round(rect.top + window.scrollY)
        const key = [...rows.keys()].find((k) => Math.abs(k - top) <= 2) ?? top
        if (!rows.has(key)) rows.set(key, [])
        // The card's own content box: what a shopper reads as "the card".
        const inner = card.querySelector('[data-testid="product-wrapper"]').getBoundingClientRect()
        rows.get(key).push(round(inner.height))
      }
      const frames = cards
        .map((card) => card.querySelector('[data-product-media], [data-testid="product-wrapper"] > :first-child'))
        .filter(Boolean)
        .map((frame) => {
          const rect = frame.getBoundingClientRect()
          return round(rect.width / rect.height)
        })
      return { index, columns: Math.max(...[...rows.values()].map((r) => r.length)), rows: [...rows.values()], frames }
    })
    .filter(Boolean)

  return { images, grids }
}

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => {})
  // Lazy images load when scrolled to; a visitor scrolls, so the probe does too.
  await page.evaluate(async () => {
    const step = window.innerHeight
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 120))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {})
  await page
    .waitForFunction(() => [...document.images].every((img) => img.complete), null, { timeout: 30_000 })
    .catch(() => {})
}

async function report(page, where, { shot }) {
  await settle(page)
  const { images, grids } = await page.evaluate(measure)
  console.log(`\n## ${where}  ${page.url()}`)
  console.log(`  images: ${images.length}`)
  for (const image of images) {
    console.log(
      `  img natural=${image.natural} frame=${image.frame} fit=${image.fit} clipped=${image.clipped ? "yes" : "no"} loaded=${image.loaded ? "yes" : "no"} ${image.src}`
    )
    if (image.clipped) fail(where, `clipped product image ${image.src} (natural ${image.natural}, frame ${image.frame}, ${image.fit})`)
    if (!image.loaded) fail(where, `product image did not load: ${image.src}`)
  }
  for (const grid of grids) {
    const ratios = [...new Set(grid.frames.map((r) => r.toFixed(2)))]
    console.log(`  grid#${grid.index} columns=${grid.columns} frame ratios=${ratios.join(",")}`)
    if (ratios.length > 1) fail(where, `grid#${grid.index} mixes frame ratios ${ratios.join(", ")}`)
    grid.rows.forEach((row, i) => {
      const spread = Math.max(...row) - Math.min(...row)
      console.log(`    row ${i + 1}: card heights ${row.join(" ")}${spread > 1 ? "  <- uneven" : ""}`)
      if (spread > 1) fail(where, `grid#${grid.index} row ${i + 1} card heights differ by ${spread.toFixed(1)}px`)
    })
  }
  if (SHOTS && shot) {
    mkdirSync(SHOTS, { recursive: true })
    const file = path.join(SHOTS, `${SHOT_TAG}-${shot}.png`)
    await page.screenshot({ path: file, fullPage: true })
    console.log(`  shot ${file}`)
  }
  return { images, grids }
}

/** Clicks the first visible match; returns whether it navigated. */
async function clickThrough(page, selectors, what) {
  for (const selector of selectors) {
    const target = page.locator(selector).filter({ visible: true }).first()
    if (await target.count()) {
      const before = page.url()
      await target.click()
      await page.waitForURL((url) => url.toString() !== before, { timeout: 45_000 }).catch(() => {})
      if (page.url() !== before) return true
    }
  }
  console.log(`  note: no clickable ${what} found`)
  return false
}

const browser = await chromium.launch()
try {
  for (const mode of MODES) {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        locale: LOCALE,
        isMobile: viewport.width < 500,
        hasTouch: viewport.width < 500,
      })
      const page = await context.newPage()
      const tag = (name) => `${name}-${viewport.name}-${mode}`
      console.log(`\n# viewport ${viewport.name}, mode ${mode}`)

      await page.goto(`${BASE_URL}/${LOCALE}`, { waitUntil: "domcontentloaded", timeout: 90_000 })
      if (mode === "dark") {
        // The switch a visitor presses: the header's on a desktop, the bottom nav's on a
        // phone. A click that lands before hydration does nothing, so it is repeated until
        // `<html>` really carries the mode.
        const toggle = page
          .locator('[data-testid="nav-mode-toggle"], [data-testid="bottom-nav-mode-toggle"]')
          .filter({ visible: true })
          .first()
        const readMode = () => page.evaluate(() => document.documentElement.getAttribute("data-mode"))
        for (let attempt = 0; attempt < 20 && (await readMode()) !== "dark"; attempt += 1) {
          if (await toggle.count()) await toggle.click({ timeout: 5_000 }).catch(() => {})
          await page.waitForTimeout(750)
        }
        const actual = await readMode()
        console.log(`  mode toggle pressed, html[data-mode]=${actual}`)
        if (actual !== "dark") fail("home", `dark mode was asked for but html[data-mode] is ${actual}`)
      }
      await report(page, `home ${viewport.name} ${mode}`, { shot: tag("home") })

      const inCatalog = await clickThrough(
        page,
        ['[data-testid="nav-store-link"]', `main a[href$="/${LOCALE}/store"]`, `a[href$="/store"]`],
        "catalog link"
      )
      if (!inCatalog) {
        fail("catalog", "no way into the catalog from the home page")
        await context.close()
        continue
      }
      await report(page, `catalog ${viewport.name} ${mode}`, { shot: tag("catalog") })

      const inCategory = await clickThrough(page, ['main a[href*="/categories/"]', 'a[href*="/categories/"]'], "category link")
      if (inCategory) {
        await report(page, `category ${viewport.name} ${mode}`, { shot: tag("category") })
        await page.goBack({ waitUntil: "domcontentloaded" })
      } else {
        fail("category", "no category link on the catalog page")
      }

      // A product WITH photos: the gallery and the related grid are what is measured there.
      const opened = await clickThrough(
        page,
        ['[data-testid="product-wrapper"]:has(img)', '[data-testid="product-wrapper"]'],
        "product card"
      )
      if (!opened) {
        fail("product", "no product card to open")
        await context.close()
        continue
      }
      const product = await report(page, `product ${viewport.name} ${mode}`, { shot: tag("product") })
      const related = await page.locator('[data-testid="related-products-container"] [data-testid="product-wrapper"]').count()
      console.log(`  related cards: ${related}`)
      if (!related) fail("related", "the product page shows no related products grid")
      if (!product.images.length) fail("product", "the product page shows no product image")

      await context.close()
    }
  }
} finally {
  await browser.close()
}

console.log(`\n${failures.length ? "FAILED" : "PASSED"}: ${failures.length} failure(s)`)
for (const line of failures) console.log(` - ${line}`)
process.exit(failures.length ? 1 : 0)
