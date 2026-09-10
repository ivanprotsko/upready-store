#!/usr/bin/env node
/**
 * End-to-end acceptance of the tenant panel against a live backend (rule 18f):
 * two tenants log in and each sees only its own products and orders.
 *
 *   PANEL_URL=http://localhost:5180 node e2e/tenant-panel.e2e.mjs
 *
 * Environment: PANEL_URL (default http://localhost:5180), BACKEND_URL (default
 * http://localhost:9023) for the API cross-check, PLAYWRIGHT (absolute path of the
 * playwright package; defaults to the pnpm store path of this workspace).
 * Exit code 0 = every check passed; the log lists each check with PASS/FAIL.
 */
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const PLAYWRIGHT =
  process.env.PLAYWRIGHT ||
  new URL("../../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright", import.meta.url).pathname
const { chromium } = require(PLAYWRIGHT)

const PANEL = process.env.PANEL_URL || "http://localhost:5180"
const BACKEND = process.env.BACKEND_URL || "http://localhost:9023"
const PASSWORD = "supersecret"
const TENANTS = [
  { email: "admin@acme.test", name: "Acme" },
  { email: "admin@globex.test", name: "Globex" },
]

let failures = 0
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`)
  if (!ok) failures++
}

/** The API is the reference the screen is compared with. */
const apiCounts = async (email) => {
  const login = await fetch(`${BACKEND}/auth/tenant/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  const { token } = await login.json()
  const get = async (p) =>
    (await fetch(`${BACKEND}${p}`, { headers: { authorization: `Bearer ${token}` } })).json()
  const products = await get("/tenants/products?limit=100")
  const orders = await get("/tenants/orders?limit=100")
  return {
    products: products.count,
    productTitles: (products.products || []).map((p) => p.title),
    orders: orders.count,
    orderIds: (orders.orders || []).map((o) => String(o.display_id)),
  }
}

const login = async (page, email) => {
  await page.goto(`${PANEL}/login`, { waitUntil: "networkidle" })
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(PASSWORD)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30_000 })
}

const rowsOf = async (page) => {
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(400)
  return page.locator("table tbody tr").allInnerTexts()
}

const browser = await chromium.launch()
try {
  const seen = {}
  for (const t of TENANTS) {
    const api = await apiCounts(t.email)
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    await login(page, t.email)
    check(`${t.name}: login lands inside the panel`, !page.url().endsWith("/login"), page.url())
    check(`${t.name}: sidebar shows the tenant name`, (await page.locator("body").innerText()).includes(t.name))

    await page.goto(`${PANEL}/products`)
    const productRows = await rowsOf(page)
    check(`${t.name}: products table rows = API count`, productRows.length === api.products, `${productRows.length} vs ${api.products}`)
    for (const title of api.productTitles) {
      check(`${t.name}: product "${title}" is on screen`, productRows.some((r) => r.includes(title)))
    }
    await page.goto(`${PANEL}/orders`)
    const orderRows = await rowsOf(page)
    check(`${t.name}: orders table rows = API count`, orderRows.length === api.orders, `${orderRows.length} vs ${api.orders}`)
    seen[t.name] = { productRows, orderRows, api }
    await ctx.close()
  }
  // Cross-tenant: nothing of Acme's on Globex's screens and vice versa.
  const [a, g] = [seen.Acme, seen.Globex]
  for (const title of a.api.productTitles) {
    check(`Globex screen has no Acme product "${title}"`, !g.productRows.some((r) => r.includes(title)))
  }
  for (const title of g.api.productTitles) {
    check(`Acme screen has no Globex product "${title}"`, !a.productRows.some((r) => r.includes(title)))
  }
  for (const id of a.api.orderIds) {
    check(`Globex screen has no Acme order #${id}`, !g.orderRows.some((r) => r.includes(`#${id}`)))
  }
} finally {
  await browser.close()
}
console.log(failures ? `${failures} check(s) failed` : "all checks passed")
process.exit(failures ? 1 : 0)
