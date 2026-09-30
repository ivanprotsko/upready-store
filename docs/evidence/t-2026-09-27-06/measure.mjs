#!/usr/bin/env node
/**
 * t-2026-09-27-06: fixes A, C and D of olavka batch 1 (t-2026-09-25-18), measured on a
 * local stand in a headless Chromium, before (dev) and after (this branch).
 *
 *   PLAYWRIGHT_PATH=<.../playwright> TAG=<before|after> CREDENTIALS=<file from stand-setup.mjs> \
 *     [PANEL=http://localhost:5611] [SHOP=http://olavka-com.localhost:8611] [WIDTHS=1440,390] \
 *     node measure.mjs
 *
 * A, panel tables: logs in as the test shop stand-setup.mjs registered and opens
 *   /product-attributes, /pages and /settings/redirects. For every body cell of every
 *   table it counts the text lines the browser laid out (the distinct tops of a Range's
 *   client rects over the cell), and records the tallest cell per screen plus every cell
 *   of more than one line.
 * C, course buy box: the width of `product-buy-card` on olavka's course page and on an
 *   ordinary one-variant product, which should be equal from 1024.
 * D, `?v_id=`: the URL of both pages two seconds after the network settles.
 * Full-page screenshots go to shots/<TAG>-<screen>-<width>.png.
 */
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? "playwright")

const TAG = process.env.TAG ?? "stand"
const PANEL = (process.env.PANEL ?? "http://localhost:5611").replace(/\/$/, "")
const SHOP = (process.env.SHOP ?? "http://olavka-com.localhost:8611").replace(/\/$/, "")
const WIDTHS = (process.env.WIDTHS ?? "1440,390").split(",").map(Number)
const { email, password } = JSON.parse(fs.readFileSync(process.env.CREDENTIALS, "utf8"))
const SHOTS = path.join(HERE, "shots")
const PANEL_SCREENS = ["product-attributes", "pages", "settings/redirects"]
const PRODUCTS = {
  course: "course-ochishchenie-pecheni-cherkashino",
  product: "steviya-v-tabletkah-saharozamenitel-100-sht-cherkashino",
}

fs.mkdirSync(SHOTS, { recursive: true })
const browser = await chromium.launch()
const viewport = (width) => ({ width, height: width < 1024 ? 844 : 900 })
const slug = (screen) => screen.replace(/\//g, "-")

// Only text nodes are measured, one rect per laid-out fragment, and fragments that overlap
// vertically are one line: an element's own box (a badge's padding) would otherwise count
// as a line of its own.
const cellLines = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("table tbody td")].map((cell) => {
      const rects = []
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.trim()) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        rects.push(...[...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0))
      }
      rects.sort((a, b) => a.top - b.top)
      const lines = []
      for (const rect of rects) {
        const last = lines[lines.length - 1]
        if (last && rect.top < last.bottom - 2) last.bottom = Math.max(last.bottom, rect.bottom)
        else lines.push({ top: rect.top, bottom: rect.bottom })
      }
      return { lines: lines.length, text: cell.innerText.replace(/\s+/g, " ").trim().slice(0, 60) }
    })
  )

const runs = []
for (const width of WIDTHS) {
  const context = await browser.newContext({ viewport: viewport(width), locale: "ru-RU" })
  const page = await context.newPage()
  await page.goto(`${PANEL}/login`, { waitUntil: "networkidle" })
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 })
  for (const screen of PANEL_SCREENS) {
    await page.goto(`${PANEL}/${screen}`, { waitUntil: "networkidle" })
    await page.locator("table tbody tr").first().waitFor({ timeout: 15000 }).catch(() => {})
    const cells = await cellLines(page)
    const run = {
      part: "A",
      screen,
      width,
      cells: cells.length,
      maxLines: Math.max(0, ...cells.map((c) => c.lines)),
      multiLine: cells.filter((c) => c.lines > 1),
      shot: `shots/${TAG}-panel-${slug(screen)}-${width}.png`,
    }
    await page.screenshot({ path: path.join(HERE, run.shot), fullPage: true })
    runs.push(run)
    console.log(`A ${screen} ${width}: ${run.cells} cells, tallest ${run.maxLines} line(s)` +
      (run.multiLine.length ? `; multi-line: ${run.multiLine.map((c) => `«${c.text}» ${c.lines}`).join(", ")}` : ""))
  }
  await context.close()

  for (const [kind, handle] of Object.entries(PRODUCTS)) {
    const shopContext = await browser.newContext({ viewport: viewport(width), locale: "ru-RU" })
    const shopPage = await shopContext.newPage()
    await shopPage.goto(`${SHOP}/ru/products/${handle}`, { waitUntil: "networkidle" })
    await shopPage.waitForTimeout(2000)
    const box = await shopPage.locator('[data-testid="product-buy-card"]').first().boundingBox()
    const run = {
      part: "C+D",
      page: kind,
      width,
      buyCardWidth: box ? Math.round(box.width) : null,
      url: shopPage.url(),
      hasVid: new URL(shopPage.url()).searchParams.has("v_id"),
      shot: `shots/${TAG}-shop-${kind}-${width}.png`,
    }
    await shopPage.screenshot({ path: path.join(HERE, run.shot), fullPage: true })
    runs.push(run)
    console.log(`C+D ${kind} ${width}: buy card ${run.buyCardWidth}px, v_id in URL: ${run.hasVid}`)
    await shopContext.close()
  }
}
await browser.close()

fs.writeFileSync(
  path.join(HERE, `measure-${TAG}.json`),
  JSON.stringify({ tag: TAG, measuredAt: new Date().toISOString(), runs }, null, 2) + "\n"
)
