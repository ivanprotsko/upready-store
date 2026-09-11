#!/usr/bin/env node
/**
 * End-to-end acceptance of the tenant panel against a live backend (rule 18f):
 * two tenants log in and each sees only its own products and orders; Acme
 * creates a product from the panel and the storefronts show it only on Acme's;
 * and (wave 2, piece 1) Acme opens one of its products, edits its title and
 * adds a priced variant on the detail screen, while Globex gets the 404 state
 * on that same product URL.
 *
 *   PANEL_URL=http://localhost:5180 node e2e/tenant-panel.e2e.mjs
 *
 * Environment: PANEL_URL (default http://localhost:5180), BACKEND_URL (default
 * http://localhost:9023) for the API cross-check, STOREFRONTS (default
 * "acme=http://localhost:8000,globex=http://localhost:8001,initech=http://localhost:8002"),
 * PLAYWRIGHT (absolute path of the playwright package; defaults to the pnpm
 * store path of this workspace), E2E_CLEANUP=1 to delete the created product at
 * the end (default: keep it, the morning acceptance looks at it).
 * Exit code 0 = every check passed; the log lists each check with PASS/FAIL.
 *
 * The storefront reads the catalog with `cache: "force-cache"` and Medusa sends
 * it no events, so every storefront is asked to revalidate (`POST /api/revalidate`)
 * before its page is read; without that step "not visible on the neighbour"
 * proves nothing.
 */
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const PLAYWRIGHT =
  process.env.PLAYWRIGHT ||
  new URL("../../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright", import.meta.url).pathname
const { chromium } = require(PLAYWRIGHT)

const PANEL = process.env.PANEL_URL || "http://localhost:5180"
const BACKEND = process.env.BACKEND_URL || "http://localhost:9023"
const STOREFRONTS = Object.fromEntries(
  (process.env.STOREFRONTS || "acme=http://localhost:8000,globex=http://localhost:8001,initech=http://localhost:8002")
    .split(",")
    .map((pair) => pair.split("="))
)
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
const apiLogin = async (email) => {
  const login = await fetch(`${BACKEND}/auth/tenant/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  const { token } = await login.json()
  return async (p, init = {}) =>
    (await fetch(`${BACKEND}${p}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) } })).json()
}
const apiCounts = async (email) => {
  const get = await apiLogin(email)
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

/**
 * The create screen is the Admin's RouteFocusModal: measured on the Admin
 * itself (2026-09-11), /products/create carries two `[role="dialog"]` trees
 * with the same fields (the focus modal plus Radix's nested dialog), so text
 * is typed into every instance and buttons are hit with a real mouse click at
 * their coordinates, which the browser routes to the topmost instance.
 */
const clickReal = async (page, locator) => {
  await locator.waitFor({ state: "attached", timeout: 15_000 })
  const box = await locator.boundingBox()
  if (!box) throw new Error(`no bounding box for ${locator}`)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}
const fillEverywhere = async (page, selector, value) => {
  const n = await page.locator(selector).count()
  for (let i = 0; i < n; i++) {
    await page.locator(selector).nth(i).fill(value, { force: true }).catch(() => {})
  }
}

const storefrontHasTitle = async (base, title) => {
  await fetch(`${base}/api/revalidate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "product.created" }),
  }).catch(() => {})
  const html = await (await fetch(`${base}/en/store`, { cache: "no-store" })).text()
  return html.includes(title)
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
    // The shell shows the store name once GET /tenants/store answers: wait for it, do not race it.
    const named = await page.getByText(t.name, { exact: false }).first().waitFor({ timeout: 15_000 }).then(() => true).catch(() => false)
    check(`${t.name}: sidebar shows the tenant name`, named)

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

  // Acme creates a product from the panel: one option Size=M, one variant priced in EUR, published.
  const stamp = new Date().toISOString().slice(11, 16).replace(":", "")
  const title = `E2E panel product ${stamp}`
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 2200 } })
  const page = await ctx.newPage()
  await login(page, "admin@acme.test")
  await page.goto(`${PANEL}/products/create`, { waitUntil: "networkidle" })
  await page.waitForTimeout(1000)
  await fillEverywhere(page, 'input[name="title"]', title)
  await clickReal(page, page.locator('button[role="switch"]').first())
  await page.waitForTimeout(400)
  // The option title is an ariakit combobox (role="combobox", no placeholder attribute).
  await clickReal(page, page.locator('[role="dialog"] input[role="combobox"]').first())
  await fillEverywhere(page, '[role="dialog"] input[role="combobox"]', "Size")
  await page.waitForTimeout(400)
  await clickReal(page, page.locator('text=Create "Size"').first())
  await page.waitForTimeout(400)
  await clickReal(page, page.locator('input[placeholder="Red, Blue, Green"]').first())
  await fillEverywhere(page, 'input[placeholder="Red, Blue, Green"]', "M")
  await page.keyboard.press("Enter")
  await page.waitForTimeout(400)
  await clickReal(page, page.locator('button:has-text("Continue")').first())
  await page.waitForTimeout(500)
  await clickReal(page, page.locator('button:has-text("Continue")').first())
  await page.waitForTimeout(800)
  await clickReal(page, page.locator('input[name="variants.0.prices.eur"]').first())
  await fillEverywhere(page, 'input[name="variants.0.prices.eur"]', "49.99")
  await page.keyboard.press("Tab")
  await page.waitForTimeout(300)
  await clickReal(page, page.locator('button:has-text("Publish")').first())
  const landed = await page
    .waitForURL((u) => u.pathname.endsWith("/products"), { timeout: 20_000 })
    .then(() => true)
    .catch(() => false)
  check("Acme: publish lands on /products", landed, page.url())
  const rowsAfter = await rowsOf(page)
  check("Acme: the new product is in the list", rowsAfter.some((r) => r.includes(title)), `${rowsAfter.length} rows`)
  await ctx.close()

  const get = await apiLogin("admin@acme.test")
  const found = await get(`/tenants/products?q=${encodeURIComponent(title)}`)
  const created = found.products?.[0]
  check("Acme: API returns the created product as published", created?.status === "published", created ? `${created.id} ${created.status}` : "not found")
  const globexGet = await apiLogin("admin@globex.test")
  const globexFound = await globexGet(`/tenants/products?q=${encodeURIComponent(title)}`)
  check("Globex: API does not return Acme's new product", (globexFound.products || []).length === 0)

  for (const [tenant, base] of Object.entries(STOREFRONTS)) {
    const visible = await storefrontHasTitle(base, title)
    const expected = tenant === "acme"
    check(`storefront ${tenant} (${base}) ${expected ? "shows" : "does not show"} "${title}"`, visible === expected)
  }
  if (created) {
    console.log(`created product: ${created.id} "${title}" (${process.env.E2E_CLEANUP ? "deleting" : "kept for the morning acceptance"})`)
    if (process.env.E2E_CLEANUP) {
      await get(`/tenants/products/${created.id}`, { method: "DELETE" })
      for (const base of Object.values(STOREFRONTS)) await storefrontHasTitle(base, title)
    }
  }

  // ---- wave 2, piece 1: product detail, its edit drawer, its variant create
  // modal, and the 404 a foreign product id gives.
  //
  // The subject is a fixture this section creates and deletes: the detail flow
  // adds a variant, and a variant needs an option value no existing variant
  // uses ("Variant with provided options already exists" is a real product
  // rule, not a panel bug), so the fixture carries a Size option with two
  // values and only one of them taken.
  {
    const acme = await apiLogin("admin@acme.test")
    const detailTitle = `E2E detail product ${stamp}`
    const createdDetail = await acme("/tenants/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: detailTitle,
        status: "published",
        options: [{ title: "Size", values: ["S", "L"] }],
        variants: [
          {
            title: `${detailTitle} S`,
            prices: [{ currency_code: "eur", amount: 10 }],
            manage_inventory: false,
            options: { Size: "S" },
          },
        ],
      }),
    })
    const target = createdDetail.product
    check("Acme: detail fixture product created", !!target?.id, target?.id || JSON.stringify(createdDetail).slice(0, 200))

    if (target?.id) {
      const editedTitle = `${detailTitle} (edited)`
      const variantTitle = `E2E variant L ${stamp}`

      const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
      const page2 = await ctx2.newPage()
      await login(page2, "admin@acme.test")

      // Opened from the list, not by typing the URL: the row's href is part of
      // the screen under test.
      await page2.goto(`${PANEL}/products`, { waitUntil: "networkidle" })
      await page2.waitForTimeout(800)
      await page2.locator(`table tbody tr:has-text("${detailTitle}")`).first().click()
      await page2
        .waitForURL((u) => u.pathname === `/products/${target.id}`, { timeout: 20_000 })
        .catch(() => {})
      check("Acme: a product row opens its detail screen", page2.url().endsWith(`/products/${target.id}`), page2.url())

      await page2.waitForTimeout(1500)
      const detailText = await page2.locator("body").innerText()
      check("Acme: the detail screen shows the product", detailText.includes(detailTitle))
      check(
        "Acme: the detail screen shows the Options and Variants sections",
        detailText.includes("Options") && detailText.includes("Variants")
      )
      check("Acme: the detail screen lists the existing variant", detailText.includes(`${detailTitle} S`))

      // Edit the title through the drawer.
      await page2.goto(`${PANEL}/products/${target.id}/edit`, { waitUntil: "networkidle" })
      await page2.waitForTimeout(1000)
      await page2.locator('[role="dialog"] input[name="title"]').first().fill(editedTitle)
      await clickReal(page2, page2.locator('[role="dialog"] button:has-text("Save")').first())
      await page2
        .waitForURL((u) => u.pathname === `/products/${target.id}`, { timeout: 20_000 })
        .catch(() => {})
      await page2.waitForTimeout(1800)
      check(
        "Acme: the edited title is on the detail screen",
        (await page2.locator("body").innerText()).includes(editedTitle),
        page2.url()
      )
      const afterEdit = await acme(`/tenants/products/${target.id}?fields=id,title`)
      check("Acme: the API agrees the title changed", afterEdit.product?.title === editedTitle, afterEdit.product?.title)

      // Add a variant with a price through the create modal.
      await page2.goto(`${PANEL}/products/${target.id}/variants/create`, { waitUntil: "networkidle" })
      await page2.waitForTimeout(1500)
      await page2.locator('[role="dialog"] input[name="title"]').first().fill(variantTitle)
      // One ariakit combobox per product option. Keyboard selection does not
      // commit a value here; the option row has to be clicked.
      const optionInputs = page2.locator('[role="dialog"] input[role="combobox"]')
      for (let i = 0; i < (await optionInputs.count()); i++) {
        await clickReal(page2, optionInputs.nth(i))
        await page2.waitForTimeout(600)
        await clickReal(page2, page2.locator('[role="option"]:has-text("L")').last())
        await page2.waitForTimeout(400)
      }
      await clickReal(page2, page2.locator('[role="dialog"] button:has-text("Continue")').first())
      await page2.waitForTimeout(1500)
      await page2.locator('[role="dialog"] input[name="prices.eur"]').first().fill("77.00")
      await page2.keyboard.press("Tab")
      await page2.waitForTimeout(500)
      await clickReal(page2, page2.locator('[role="dialog"] button:has-text("Save")').first())
      await page2
        .waitForURL((u) => u.pathname === `/products/${target.id}`, { timeout: 20_000 })
        .catch(() => {})
      await page2.waitForTimeout(2500)
      check("Acme: the variant modal closed onto the detail screen", page2.url().endsWith(`/products/${target.id}`), page2.url())
      check(
        "Acme: the new variant is in the detail screen's variants table",
        (await page2.locator("body").innerText()).includes(variantTitle)
      )

      const afterVariant = await acme(
        `/tenants/products/${target.id}?fields=id,*variants,*variants.prices`
      )
      const newVariant = (afterVariant.product?.variants || []).find((v) => v.title === variantTitle)
      check("Acme: the API returns the new variant", !!newVariant, `${afterVariant.product?.variants?.length} variants`)
      check(
        "Acme: the new variant carries its EUR price",
        !!newVariant && (newVariant.prices || []).some((pr) => pr.currency_code === "eur" && Number(pr.amount) === 77),
        newVariant ? JSON.stringify(newVariant.prices) : ""
      )
      await ctx2.close()

      // Globex opens Acme's product URL: the 404 state, not the product.
      const gctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      const gpage = await gctx.newPage()
      await login(gpage, "admin@globex.test")
      await gpage.goto(`${PANEL}/products/${target.id}`, { waitUntil: "networkidle" })
      await gpage.waitForTimeout(2500)
      const gtext = await gpage.locator("body").innerText()
      check("Globex: Acme's product URL renders the 404 state", gtext.includes("404"))
      check("Globex: Acme's product title is nowhere on that screen", !gtext.includes(editedTitle))
      await gctx.close()

      await acme(`/tenants/products/${target.id}`, { method: "DELETE" })
      const gone = await acme(`/tenants/products?q=${encodeURIComponent(detailTitle)}`)
      check("Acme: the detail fixture is deleted again", (gone.products || []).length === 0)
    }
  }

} finally {
  await browser.close()
}
console.log(failures ? `${failures} check(s) failed` : "all checks passed")
process.exit(failures ? 1 : 0)
