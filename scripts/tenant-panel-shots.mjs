#!/usr/bin/env node
/**
 * Screenshots for the tenant panel acceptance: the same four screens in the native Admin
 * (:9023/app) and in the tenant panel, side by side, so Ivan can compare them by eye.
 *
 *   node scripts/tenant-panel-shots.mjs admin   # admin-*.png
 *   node scripts/tenant-panel-shots.mjs panel   # panel-*.png (PANEL_URL, default http://localhost:5180)
 *
 * Output: artifacts/docs/tenant-panel-shots/<side>-<screen>.png (git-ignored binaries, rule 21f).
 *
 * Environment: PLAYWRIGHT (absolute path of the playwright package), ADMIN_URL,
 * PANEL_URL, BACKEND_URL (default http://localhost:9023) and SHOT_PRODUCT_ID.
 * The product-detail screens need one product both sides can open; without
 * SHOT_PRODUCT_ID the script asks BACKEND_URL for the first product of
 * PANEL_EMAIL's tenant, which the native Admin can open too because staff see
 * every product.
 */
import { createRequire } from "node:module"
import { mkdirSync } from "node:fs"
import path from "node:path"

const require = createRequire(import.meta.url)
const { chromium } = require(
  process.env.PLAYWRIGHT ||
    "/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-vendors/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright"
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

const BACKEND = process.env.BACKEND_URL || "http://localhost:9023"
const PANEL_EMAIL = process.env.PANEL_EMAIL || "admin@acme.test"

/** One product id both sides open, so the pair of shots shows the same row. */
const resolveProductId = async () => {
  if (process.env.SHOT_PRODUCT_ID) {
    return process.env.SHOT_PRODUCT_ID
  }
  const login = await fetch(`${BACKEND}/auth/tenant/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: PANEL_EMAIL, password: "supersecret" }),
  })
  const { token } = await login.json()
  const list = await fetch(`${BACKEND}/tenants/products?limit=1&fields=id,title`, {
    headers: { authorization: `Bearer ${token}` },
  })
  const { products } = await list.json()
  return products?.[0]?.id
}

const productId = await resolveProductId()
if (!productId) {
  console.error(`no product to shoot: set SHOT_PRODUCT_ID or seed ${PANEL_EMAIL}'s tenant`)
  process.exit(2)
}
console.log("product under the detail shots:", productId)

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

  // tenant panel wave 2, piece 1: the product-detail subtree. Same product id
  // on both sides, so the pair compares like for like.
  await page.goto(`${cfg.base}/products/${productId}`, { waitUntil: "networkidle" })
  await page.waitForTimeout(1200)
  await shot(page, "product-detail")

  await page.goto(`${cfg.base}/products/${productId}/edit`, { waitUntil: "networkidle" })
  await page.waitForTimeout(1000)
  await shot(page, "product-edit")

  await page.goto(`${cfg.base}/products/${productId}/variants/create`, { waitUntil: "networkidle" })
  await page.waitForTimeout(1200)
  await shot(page, "product-variant-create")

  await page.goto(`${cfg.base}/products/${productId}/prices`, { waitUntil: "networkidle" })
  await page.waitForTimeout(1500)
  await shot(page, "product-prices")
  console.log(`done in ${Date.now() - t0} ms`)
} catch (e) {
  await shot(page, "error")
  console.error("FAILED:", e.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
