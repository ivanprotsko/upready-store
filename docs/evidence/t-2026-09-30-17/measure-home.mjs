#!/usr/bin/env node
/**
 * t-2026-09-30-17: the home page of one stand, measured in a headless Chromium.
 *
 *   PLAYWRIGHT_PATH=<.../playwright> BASE=http://localhost:8614 TAG=<label> \
 *     [MODES=light,dark] [WIDTHS=1440,390] node measure-home.mjs
 *
 * For every mode and width it writes a full-page screenshot to shots/<TAG>-<mode>-<width>.png
 * and records into measure-<TAG>.json:
 *   - the listing section: its variant, heading and the number of products it shows
 *   - the product grid of that section, when it is one: product count, display and the
 *     left edge and width of every card, which is what "collapsed and centred" means
 *   - the category tiles: how many, and how many of their images the browser decoded
 *   - the footer: every link (text and href) and which of them leave the site
 *   - starter links: matches of the Medusa starter's hosts in the whole served HTML
 * The mode is set the way a returning visitor carries it, in localStorage before the
 * first paint (`upready-store.mode`, `src/lib/theme/attributes.ts`).
 */
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? "playwright")

const BASE = process.env.BASE ?? "http://localhost:8614"
const TAG = process.env.TAG ?? "stand"
const MODES = (process.env.MODES ?? "light,dark").split(",")
const WIDTHS = (process.env.WIDTHS ?? "1440,390").split(",").map(Number)
const SHOTS = path.join(HERE, "shots")
const STARTER = /medusajs\.com|github\.com\/medusajs|docs\.medusajs|dtc-starter|nextjs-starter-medusa|Powered by Medusa/gi

fs.mkdirSync(SHOTS, { recursive: true })
const browser = await chromium.launch()
const runs = []

for (const mode of MODES) {
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    await context.addInitScript((value) => {
      try {
        localStorage.setItem("upready-store.mode", value)
      } catch {}
    }, mode)
    const page = await context.newPage()
    const response = await page.goto(`${BASE}/en`, { waitUntil: "networkidle" })
    // Scroll through once so every lazy image below the fold is requested and decoded.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 120))
      }
      window.scrollTo(0, 0)
    })
    await page.waitForLoadState("networkidle")
    const html = await page.content()
    const measured = await page.evaluate(() => {
      const listing = document.querySelector('[data-testid^="home-listing-"]')
      const grid = listing?.querySelector("[data-product-grid]")
      const cards = grid
        ? [...grid.children].filter((li) => getComputedStyle(li).display !== "none")
        : []
      const gridBox = grid?.getBoundingClientRect()
      const tiles = document.querySelector('[data-testid="category-tiles"]')
      const tileImages = tiles ? [...tiles.querySelectorAll("img")] : []
      const footerLinks = [...document.querySelectorAll("footer a")].map((a) => ({
        text: (a.textContent ?? "").trim().replace(/\s+/g, " "),
        href: a.getAttribute("href"),
        external: !!a.getAttribute("href")?.match(/^https?:\/\//) && !a.href.startsWith(location.origin),
      }))
      return {
        mode: document.documentElement.getAttribute("data-mode"),
        listing: listing
          ? {
              variant: listing.getAttribute("data-testid"),
              heading: listing.querySelector("h2")?.textContent?.trim() ?? null,
              products: listing.querySelectorAll(":scope ul > li").length,
            }
          : null,
        grid: grid
          ? {
              productCount: Number(grid.getAttribute("data-product-count")),
              display: getComputedStyle(grid).display,
              gridLeft: Math.round(gridBox.left),
              gridWidth: Math.round(gridBox.width),
              visibleCards: cards.length,
              cards: cards.map((li) => {
                const box = li.getBoundingClientRect()
                return { left: Math.round(box.left), top: Math.round(box.top + scrollY), width: Math.round(box.width) }
              }),
            }
          : null,
        tiles: tiles
          ? {
              count: tiles.querySelectorAll("li").length,
              imagesDecoded: tileImages.filter((img) => img.complete && img.naturalWidth > 0).length,
              images: tileImages.length,
            }
          : null,
        footer: {
          count: document.querySelectorAll("footer").length,
          links: footerLinks,
        },
      }
    })
    const file = `${TAG}-${mode}-${width}.png`
    await page.screenshot({ path: path.join(SHOTS, file), fullPage: true })
    runs.push({
      url: `${BASE}/en`,
      status: response?.status(),
      requestedMode: mode,
      width,
      screenshot: `shots/${file}`,
      starterLinkMatches: (html.match(STARTER) ?? []).length,
      ...measured,
    })
    await context.close()
  }
}

await browser.close()
const out = { tag: TAG, base: BASE, measuredAt: new Date().toISOString(), runs }
fs.writeFileSync(path.join(HERE, `measure-${TAG}.json`), JSON.stringify(out, null, 2) + "\n")
for (const r of runs) {
  console.log(
    [
      `${TAG} ${r.requestedMode}/${r.width}`,
      `status ${r.status}`,
      `data-mode ${r.mode}`,
      r.listing ? `${r.listing.variant} «${r.listing.heading}» ${r.listing.products}` : "no listing",
      r.grid ? `grid n=${r.grid.productCount} ${r.grid.display} visible=${r.grid.visibleCards}` : "",
      r.tiles ? `tiles ${r.tiles.count} decoded ${r.tiles.imagesDecoded}/${r.tiles.images}` : "no tiles",
      `footer links ${r.footer.links.length} external ${r.footer.links.filter((l) => l.external).map((l) => l.href).join(" ") || "-"}`,
      `starter ${r.starterLinkMatches}`,
    ]
      .filter(Boolean)
      .join(" · ")
  )
}
