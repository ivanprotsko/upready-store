#!/usr/bin/env node
/**
 * Screenshots for the tenant panel acceptance: the same four screens in the native Admin
 * (:9023/app) and in the tenant panel, side by side, so Ivan can compare them by eye.
 *
 *   node scripts/tenant-panel-shots.mjs admin   # admin-*.png
 *   node scripts/tenant-panel-shots.mjs panel   # panel-*.png (PANEL_URL, default http://localhost:5180)
 *   node scripts/tenant-panel-shots.mjs storefront   # storefront-*.png (wave 2, piece 8)
 *
 * Output: artifacts/docs/tenant-panel-shots/<side>-<screen>.png (git-ignored binaries, rule 21f).
 *
 * Environment: PLAYWRIGHT (absolute path of the playwright package), ADMIN_URL,
 * PANEL_URL, BACKEND_URL (default http://localhost:9023), SHOT_PRODUCT_ID and
 * SHOT_CATEGORY_ID. The product-detail screens need one product both sides can
 * open; without SHOT_PRODUCT_ID the script asks BACKEND_URL for the first
 * product of PANEL_EMAIL's tenant, which the native Admin can open too because
 * staff see every product. The category screens (wave 2, piece 5) work the same
 * way through SHOT_CATEGORY_ID and `GET /tenants/product-categories`; when that
 * tenant owns no category yet, the script creates one so the pair is shootable
 * and says so on stdout.
 */
import { createRequire } from "node:module"
import { mkdirSync } from "node:fs"
import path from "node:path"

const require = createRequire(import.meta.url)
// tenant-panel wave 2, piece 4: was a hardcoded path into a SIBLING worktree
// (feat/mt-vendors), which this worktree has no business depending on;
// resolved relative to this worktree's own node_modules instead, the same way
// e2e/tenant-panel.e2e.mjs already does.
const { chromium } = require(
  new URL("../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright", import.meta.url).pathname
)

const side = process.argv[2]
if (!["admin", "panel", "storefront"].includes(side)) {
  console.error("usage: tenant-panel-shots.mjs admin|panel|storefront")
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

/**
 * tenant panel wave 2, piece 8. The storefront side is not a panel screen and has no
 * login: it is the page the home-page document produces. `SHOT_NAME` names the frame
 * ("home-acme-before" / "home-acme-after"), so the files land as
 * `storefront-home-acme-before.png` next to the panel/admin pairs. The theme and mode the
 * document sets are printed beside the file, because a screenshot of a dark page proves
 * the mode only if the attribute agrees (rule 18f: a mode you name is a coordinate you
 * must have entered).
 */
if (side === "storefront") {
  const base = process.env.STOREFRONT_URL || "http://localhost:8012"
  const name = process.env.SHOT_NAME || "home"
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  try {
    await page.goto(`${base}/en`, { waitUntil: "networkidle" })
    await shot(page, name)
    const attrs = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute("data-theme"),
      mode: document.documentElement.getAttribute("data-mode"),
    }))
    console.log("data-theme:", attrs.theme, "data-mode:", attrs.mode)
  } catch (e) {
    console.error("FAILED:", e.message)
    process.exitCode = 1
  } finally {
    await browser.close()
  }
  process.exit(process.exitCode ?? 0)
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

/**
 * One category id both sides open, same reasoning as the product: staff see
 * every category, the tenant sees only its own. `/tenants/product-categories`
 * is tenant-scoped since wave 2, piece 5, so a tenant with no category of its
 * own has nothing to shoot; the script then creates one rather than skipping
 * the pair.
 */
const resolveCategoryId = async () => {
  if (process.env.SHOT_CATEGORY_ID) {
    return process.env.SHOT_CATEGORY_ID
  }
  const login = await fetch(`${BACKEND}/auth/tenant/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: PANEL_EMAIL, password: "supersecret" }),
  })
  const { token } = await login.json()
  const auth = { authorization: `Bearer ${token}` }
  const list = await fetch(`${BACKEND}/tenants/product-categories?limit=1&fields=id,name`, {
    headers: auth,
  })
  const { product_categories } = await list.json()
  if (product_categories?.[0]?.id) {
    return product_categories[0].id
  }
  const created = await fetch(`${BACKEND}/tenants/product-categories`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ name: `Shot category ${Date.now()}`, is_active: true }),
  })
  const { product_category } = await created.json()
  console.log("created a category to shoot:", product_category?.id)
  return product_category?.id
}

const categoryId = await resolveCategoryId()
if (!categoryId) {
  console.error(`no category to shoot: set SHOT_CATEGORY_ID or seed ${PANEL_EMAIL}'s tenant`)
  process.exit(2)
}
console.log("category under the category shots:", categoryId)

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
  // tenant-panel wave 2, piece 4 (profile + password).
  await page.goto(`${cfg.base}/settings/profile`, { waitUntil: "networkidle" })
  await page.waitForTimeout(500)
  await shot(page, "profile")

  await page.goto(`${cfg.base}/settings/profile/edit`, { waitUntil: "networkidle" })
  await page.waitForTimeout(500)
  await shot(page, "profile-edit")

  // Wave 2, pieces 2 and 3. ORDER_ID names the order both sides open, so the
  // Admin and the panel show the SAME row; without it the first row of each
  // list is taken, and the Admin's first row is whatever tenant placed it.
  // tenant panel wave 2, piece 8: the fallback below clicks the first row of "the
  // table", which used to be whatever screen the walk had reached — since piece 4 added
  // the profile shots above, that was `/settings/profile/edit`, a screen with no table,
  // and the whole script died there 30 s later. Go back to the orders list first.
  await page.goto(`${cfg.base}/orders`, { waitUntil: "networkidle" })
  await page.waitForTimeout(800)
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

  // tenant panel wave 2, piece 5: the category screens. The list differs by
  // design (the panel shows only the tenant's own categories, the Admin shows
  // every one), the detail and create screens are the same files.
  await page.goto(`${cfg.base}/categories`, { waitUntil: "networkidle" })
  await page.waitForTimeout(800)
  await shot(page, "categories")

  await page.goto(`${cfg.base}/categories/${categoryId}`, { waitUntil: "networkidle" })
  await page.waitForTimeout(1500)
  await shot(page, "category-detail")

  await page.goto(`${cfg.base}/categories/create`, { waitUntil: "networkidle" })
  await page.waitForTimeout(1000)
  await shot(page, "category-create")

  // tenant panel wave 2, piece 8: the home-page settings screen. The Admin has no
  // equivalent document, so the frame beside it is the Admin's own store settings
  // (`/app/settings/store`) — the nearest screen in shape: one container of form rows
  // the operator saves in place. The two are compared for chrome and control style, not
  // for content.
  await page.goto(
    side === "admin" ? `${cfg.base}/settings/store` : `${cfg.base}/home-settings`,
    { waitUntil: "networkidle" }
  )
  await page.waitForTimeout(1200)
  await shot(page, "home-settings")
  console.log(`done in ${Date.now() - t0} ms`)
} catch (e) {
  await shot(page, "error")
  console.error("FAILED:", e.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
