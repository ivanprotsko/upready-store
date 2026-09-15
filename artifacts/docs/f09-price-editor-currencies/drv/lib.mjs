/**
 * f09-price-editor-currencies — measurement helpers.
 *
 * The stand is a LOCAL copy of the live shop: postgres database
 * `upready_store_f09` cloned from `upready_store_cherkashina` (the
 * 2026-09-12 migration of olavka.ru into tenant `cherkashino`), backend
 * `medusa develop` on :9029, panel `vite` on :5182 serving THIS worktree.
 * The owner logs in as `f09-owner@example.test`, an auth identity pointed at
 * the same `tenant_admin` row as the real owner.
 */
import fs from "node:fs"
import path from "node:path"
import { chromium } from "/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-price-editor-currencies/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs"

export const ROOT =
  "/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-price-editor-currencies/artifacts/docs/f09-price-editor-currencies"
export const SHOTS = path.join(ROOT, "shots")
export const RAW = path.join(ROOT, "raw")
export const PANEL = process.env.PANEL_URL || "http://localhost:5182"
export const BACKEND = process.env.BACKEND_URL || "http://localhost:9029"
export const EMAIL = "f09-owner@example.test"
export const PASSWORD = "supersecret"

export async function launch() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "ru-RU",
  })
  const page = await ctx.newPage()
  const errors = []
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 300))
  })
  page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 300)))
  return { browser, ctx, page, errors }
}

export async function login(page) {
  await page.goto(PANEL + "/login", { waitUntil: "domcontentloaded" })
  await page.fill('input[autocomplete="email"]', EMAIL)
  await page.fill('input[autocomplete="current-password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !String(u).includes("/login"), { timeout: 60000 })
}

export async function shot(page, name) {
  const p = path.join(SHOTS, `${name}-1280x900.png`)
  await page.screenshot({ path: p, fullPage: false })
  return p
}

export function save(name, obj) {
  const p = path.join(RAW, name)
  fs.writeFileSync(p, JSON.stringify(obj, null, 2))
  return p
}

/** Column headers of the data grid, in render order. */
export const headers = (page) =>
  page.$$eval("[data-column-index]", (els) => {
    const seen = new Map()
    for (const el of els) {
      if (el.tagName.toLowerCase() !== "div") continue
      if (el.hasAttribute("data-row-index")) continue
      const idx = Number(el.getAttribute("data-column-index"))
      if (!seen.has(idx)) seen.set(idx, (el.innerText || "").trim())
    }
    return [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([, t]) => t)
  })

/**
 * How many Tab presses it takes, from a freshly opened screen, until the grid
 * cell holding `field` is the anchor.
 *
 * The grid traps Tab: `handleTabKey` (use-data-grid-keydown-event.tsx) moves
 * the anchor exactly ONE column to the right per press, and the focused node
 * is the cell CONTAINER div wrapping the input that carries `data-field`.
 * The screen opens with an anchor already placed, so 0 is a legal answer —
 * that is the count this returns when the field is the opening cell.
 *
 * Returns `steps: null` when `max` presses were not enough.
 */
export async function tabsTo(page, field, max = 400) {
  const onField = () =>
    page.evaluate((f) => {
      const el = document.activeElement
      return !!el?.querySelector?.(`[data-field="${f}"]`)
    }, field)

  if (await onField()) {
    return { steps: 0 }
  }

  for (let i = 1; i <= max; i++) {
    await page.keyboard.press("Tab")
    await page.waitForTimeout(60)
    if (await onField()) {
      return { steps: i }
    }
  }
  return { steps: null }
}

/** The cell the grid opens focused on, as its `data-field`. */
export const anchorField = (page) =>
  page.evaluate(
    () =>
      document.activeElement?.querySelector?.("[data-field]")?.getAttribute(
        "data-field"
      ) ?? null
  )
