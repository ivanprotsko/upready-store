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
// tenant-panel wave 2, piece 7: a third side. The content pages are the first
// screens whose acceptance is on the STOREFRONT rather than in the panel, and a
// storefront needs no login, no product id and no Admin counterpart — so it runs
// its own short flow below rather than joining the admin/panel pair.
if (!["admin", "panel", "storefront"].includes(side)) {
  console.error("usage: tenant-panel-shots.mjs admin|panel|storefront")
  process.exit(2)
}
const OUT = path.resolve("artifacts/docs/tenant-panel-shots")
mkdirSync(OUT, { recursive: true })

const cfg =
  side === "storefront"
    ? {
        base: process.env.STOREFRONT_URL || "http://localhost:8011",
        email: "",
        password: "",
        afterLogin: /.*/,
      }
    : side === "admin"
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

// tenant-panel wave 2, piece 7: the storefront side. Its own browser, closed
// here, so the shared launch below still owns exactly one browser.
if (side === "storefront") {
  const key = process.env.SHOT_PAGE_KEY || "contacts"
  const sfBrowser = await chromium.launch()
  const sfCtx = await sfBrowser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
  })
  const sfPage = await sfCtx.newPage()
  try {
    await sfPage.goto(`${cfg.base}/en/pages/${key}`, { waitUntil: "networkidle" })
    await sfPage.waitForTimeout(600)
    await shot(sfPage, `page-${key}`)

    // The footer is below the fold on every page; scroll to it before shooting,
    // otherwise the shot is of the hero and proves nothing about the links.
    await sfPage.goto(`${cfg.base}/en`, { waitUntil: "networkidle" })
    await sfPage.waitForTimeout(600)
    await sfPage.locator("footer").last().scrollIntoViewIfNeeded()
    await sfPage.waitForTimeout(400)
    await shot(sfPage, "footer")
  } catch (e) {
    console.error("FAILED:", e.message)
    process.exitCode = 1
  } finally {
    await sfBrowser.close()
  }
} else {


/**
 * One promotion id both sides open. The native Admin sees every promotion, so
 * the tenant's own is the id that works on both; a stand with no promotion for
 * this tenant simply skips the detail shot rather than failing the run.
 */
const resolvePromotionId = async () => {
  if (process.env.SHOT_PROMOTION_ID) {
    return process.env.SHOT_PROMOTION_ID
  }
  const login = await fetch(`${BACKEND}/auth/tenant/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: PANEL_EMAIL, password: "supersecret" }),
  })
  const { token } = await login.json()
  const list = await fetch(`${BACKEND}/tenants/promotions?limit=1&fields=id,code`, {
    headers: { authorization: `Bearer ${token}` },
  })
  const { promotions } = await list.json()
  return promotions?.[0]?.id
}
const productId = await resolveProductId()
const promotionId = await resolvePromotionId()
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
  // tenant-panel wave 2, piece 7: the content pages. `pages` is a real pair —
  // the panel's list against the Admin's /app/settings/store, which is the
  // nearest Admin screen of the same kind (a settings table in the same shell),
  // shot side by side so the shell itself can be compared. `page-edit` is panel
  // only: the Admin has no content-page editor to stand beside it.
  if (side === "panel") {
    await page.goto(`${cfg.base}/pages`, { waitUntil: "networkidle" })
    await page.waitForTimeout(800)
    await shot(page, "pages")

    await page.goto(`${cfg.base}/pages/${process.env.SHOT_PAGE_KEY || "contacts"}`, {
      waitUntil: "networkidle",
    })
    await page.waitForTimeout(1200)
    await shot(page, "page-edit")
  } else {
    await page.goto(`${cfg.base}/settings/store`, { waitUntil: "networkidle" })
    await page.waitForTimeout(800)
    await shot(page, "pages")
  }

  // tenant-panel wave 2, piece 6 (promotions + campaigns).
  await page.goto(`${cfg.base}/promotions`, { waitUntil: "networkidle" })
  await page.waitForTimeout(700)
  await shot(page, "promotions")

  await page.goto(`${cfg.base}/promotions/create`, { waitUntil: "networkidle" })
  await page.waitForTimeout(1000)
  await shot(page, "promotion-create")

  if (promotionId) {
    await page.goto(`${cfg.base}/promotions/${promotionId}`, { waitUntil: "networkidle" })
    await page.waitForTimeout(1200)
    await shot(page, "promotion-detail")
  }

  console.log(`done in ${Date.now() - t0} ms`)
} catch (e) {
  await shot(page, "error")
  console.error("FAILED:", e.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
}
