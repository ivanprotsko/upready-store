#!/usr/bin/env node
/**
 * Screenshots for the tenant panel acceptance: the same four screens in the native Admin
 * (:9023/app) and in the tenant panel, side by side, so Ivan can compare them by eye.
 *
 *   node scripts/tenant-panel-shots.mjs admin   # admin-*.png
 *   node scripts/tenant-panel-shots.mjs panel   # panel-*.png (PANEL_URL, default http://localhost:5180)
 *
 * Output: artifacts/docs/tenant-panel-shots/<side>-<screen>.png (git-ignored binaries, rule 21f).
 */
import { createRequire } from "node:module"
import { mkdirSync } from "node:fs"
import path from "node:path"

const require = createRequire(import.meta.url)
// The package is resolved from THIS checkout's own node_modules. It used to be
// an absolute path into the feat/mt-vendors worktree, which does not exist in
// every checkout; PLAYWRIGHT still overrides it.
const { chromium } = require(
  process.env.PLAYWRIGHT ||
    new URL("../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright", import.meta.url)
      .pathname
)

const side = process.argv[2]
if (!["admin", "panel"].includes(side)) {
  console.error("usage: tenant-panel-shots.mjs admin|panel")
  process.exit(2)
}
const OUT = path.resolve("artifacts/docs/tenant-panel-shots")
mkdirSync(OUT, { recursive: true })

const cfg =
  side === "admin"
    ? {
        base: process.env.ADMIN_URL || "http://localhost:9023/app",
        email: "admin@upready.dev",
        password: "supersecret",
        afterLogin: /\/app\/(orders|products|$)/,
      }
    : {
        base: process.env.PANEL_URL || "http://localhost:5180",
        email: process.env.PANEL_EMAIL || "admin@acme.test",
        password: "supersecret",
        afterLogin: /\/(products|orders)?$/,
      }

/** Screens finish drawing after network idle: wait until no skeleton (animate-pulse) is left. */
const settled = async (page) => {
  await page.waitForLoadState("networkidle")
  try {
    await page.waitForFunction(() => document.querySelectorAll(".animate-pulse").length === 0, null, { timeout: 15_000 })
  } catch {
    console.warn("skeletons still visible after 15 s, shooting anyway")
  }
  await page.waitForTimeout(400)
}

const shot = async (page, name) => {
  await settled(page)
  const file = path.join(OUT, `${side}-${name}.png`)
  await page.screenshot({ path: file })
  console.log("shot", file)
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" })
const page = await ctx.newPage()
const t0 = Date.now()
try {
  await page.goto(`${cfg.base}/login`, { waitUntil: "networkidle" })
  await shot(page, "login")
  await page.locator('input[name="email"]').fill(cfg.email)
  await page.locator('input[name="password"]').fill(cfg.password)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL(cfg.afterLogin, { timeout: 30_000 })
  await page.waitForLoadState("networkidle")
  // The protected shell shows a spinner until the "me" request settles; wait for the sidebar.
  await page.getByRole("link", { name: /^products$/i }).first().waitFor({ timeout: 30_000 })
  await shot(page, "after-login")

  await page.goto(`${cfg.base}/products`, { waitUntil: "networkidle" })
  await page.waitForTimeout(500)
  await shot(page, "products")

  await page.goto(`${cfg.base}/products/create`, { waitUntil: "networkidle" })
  await page.waitForTimeout(800)
  await shot(page, "product-create")

  await page.goto(`${cfg.base}/orders`, { waitUntil: "networkidle" })
  await page.waitForTimeout(500)
  await shot(page, "orders")

  // Wave 2, pieces 2 and 3. ORDER_ID names the order both sides open, so the
  // Admin and the panel show the SAME row; without it the first row of each
  // list is taken, and the Admin's first row is whatever tenant placed it.
  const orderId =
    process.env.ORDER_ID ||
    (await page
      .locator("table tbody tr")
      .first()
      .click()
      .then(() => page.waitForTimeout(1500))
      .then(() => page.url().split("/orders/")[1]?.split("/")[0] || ""))

  if (orderId) {
    await page.goto(`${cfg.base}/orders/${orderId}`, { waitUntil: "networkidle" })
    await page.waitForTimeout(1200)
    await shot(page, "order-detail")

    await page.goto(`${cfg.base}/orders/${orderId}/fulfillment`, { waitUntil: "networkidle" })
    await page.waitForTimeout(1800)
    await shot(page, "order-fulfillment-create")
  } else {
    console.warn("no order id: skipping order-detail and order-fulfillment-create")
  }

  await page.goto(`${cfg.base}/orders/export`, { waitUntil: "networkidle" })
  await page.waitForTimeout(1200)
  await shot(page, "order-export")
  console.log(`done in ${Date.now() - t0} ms`)
} catch (e) {
  await shot(page, "error")
  console.error("FAILED:", e.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
