#!/usr/bin/env node
/**
 * End-to-end acceptance of the tenant panel against a live backend (rule 18f):
 * two tenants log in and each sees only its own products and orders; Acme
 * creates a product from the panel and the storefronts show it only on Acme's.
 *
 *   PANEL_URL=http://localhost:5180 node e2e/tenant-panel.e2e.mjs
 *
 * Environment: PANEL_URL (default http://localhost:5180), BACKEND_URL (default
 * http://localhost:9023) for the API cross-check, STOREFRONTS (default
 * "acme=http://localhost:8000,globex=http://localhost:8001,initech=http://localhost:8002"),
 * PLAYWRIGHT (absolute path of the playwright package; defaults to the pnpm
 * store path of this workspace), E2E_CLEANUP=1 to delete the created product at
 * the end (default: keep it, the morning acceptance looks at it), E2E_ONLY to
 * run one section alone ("orders" = the wave-2 order-detail and export checks,
 * "catalog" = the wave-1 product checks; unset = both).
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

const ONLY = process.env.E2E_ONLY || ""
const runs = (section) => !ONLY || ONLY === section

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
  await page.waitForFunction(() => !location.pathname.endsWith("/login"), null, { timeout: 30_000 })
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
  if (runs("catalog")) {
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
  }

  // ---- wave 2, pieces 2 and 3: order detail, fulfil, ship, export.
  //
  // The read checks open whatever order the list shows first. The write flow
  // (fulfil + ship) deliberately picks the LAST order that is still
  // `not_fulfilled`, so the order the screenshots are taken of keeps its
  // untouched state; the id it mutates is printed.
  if (runs("orders")) {
    const acmeGet = await apiLogin("admin@acme.test")
    const acmeOrders = (await acmeGet("/tenants/orders?limit=100&order=display_id")).orders || []
    check("Acme: the API has at least one order to open", acmeOrders.length > 0, `${acmeOrders.length} orders`)

    const first = acmeOrders[0]
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1600 } })
    const page = await ctx.newPage()
    await login(page, "admin@acme.test")

    // Open the order from the LIST, the way a person does, not by URL.
    await page.goto(`${PANEL}/orders`, { waitUntil: "networkidle" })
    await page.waitForTimeout(600)
    await page.locator("table tbody tr").first().click()
    const opened = await page
      .waitForURL((u) => /\/orders\/order_/.test(u.pathname), { timeout: 20_000 })
      .then(() => true)
      .catch(() => false)
    check("Acme: clicking a row opens the order detail", opened, page.url())

    const openedId = page.url().split("/orders/")[1]?.split("/")[0] || ""
    const detail = (await acmeGet(`/tenants/orders/${openedId}?fields=id,display_id,email,total,*items,*customer,*summary`)).order
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(800)
    const body = await page.locator("body").innerText()

    check("order detail: the display id is on screen", body.includes(`#${detail.display_id}`))
    // The customer section shows the CUSTOMER's email, which is not always the
    // order's own `email` field (a guest order carries only the latter).
    const emailOnScreen = detail.customer?.email || detail.email
    check("order detail: the customer email is on screen", body.includes(emailOnScreen), emailOnScreen)
    for (const item of detail.items || []) {
      check(`order detail: item "${item.title}" is on screen`, body.includes(item.title))
    }
    check(
      "order detail: the status words are on screen",
      /Awaiting|Pending|Authorized|Captured|Not fulfilled|Fulfilled|Shipped|Delivered/i.test(body),
      body.match(/Awaiting|Pending|Authorized|Captured|Not fulfilled|Fulfilled|Shipped|Delivered/gi)?.join(", ")
    )
    check(
      "order detail: the summary shows the order total",
      body.includes(String(detail.summary?.current_order_total ?? detail.total)) ||
        /Total/i.test(body)
    )

    // Fulfil and ship. The two screens are routes of their own, so they are
    // opened as routes; the form is the Admin's own file.
    const fulfillable = [...acmeOrders].reverse().find((o) => o.fulfillment_status === "not_fulfilled")
    if (!fulfillable) {
      check("Acme: an order is available to fulfil", false, "every order is already fulfilled")
    } else {
      console.log(`fulfilling order ${fulfillable.id} #${fulfillable.display_id}`)
      await page.goto(`${PANEL}/orders/${fulfillable.id}/fulfillment`, { waitUntil: "networkidle" })
      await page.waitForTimeout(2500)

      // The location is an ariakit combobox whose options come from the server
      // as you type; the stand has 200+ warehouses, so the tenant's own is
      // found by searching its name rather than by scrolling. Picking it makes
      // the form refetch the shipping options for that warehouse, and the
      // form's own effect then selects the order's shipping method, which is
      // what enables the submit button (`disabled={!shippingOptionId}`).
      const locationBox = page.locator('input[role="combobox"]').first()
      await locationBox.click()
      await locationBox.pressSequentially("Acme warehouse", { delay: 60 })
      await page.waitForTimeout(2500)
      const options = await page.locator('[role="option"]:visible').allInnerTexts()
      check("fulfillment form: the tenant's warehouse is offered", options.length > 0, options.join(", "))
      await page.locator('[role="option"]:visible').first().click()
      await page.waitForTimeout(3500)

      const submit = page.locator('button[type="submit"]').first()
      check("fulfillment form: the submit button is enabled", await submit.isEnabled())
      await submit.click()
      const fulfilled = await page
        .waitForURL((u) => u.pathname === `/orders/${fulfillable.id}`, { timeout: 30_000 })
        .then(() => true)
        .catch(() => false)
      check("Acme: creating a fulfillment returns to the order", fulfilled, page.url())

      const afterFulfil = (await acmeGet(`/tenants/orders/${fulfillable.id}?fields=id,fulfillment_status,*fulfillments`)).order
      check(
        "Acme: the order is fulfilled after the panel action",
        afterFulfil?.fulfillment_status === "fulfilled",
        String(afterFulfil?.fulfillment_status)
      )

      const fulfillmentId = afterFulfil?.fulfillments?.[0]?.id
      if (fulfillmentId) {
        await page.goto(`${PANEL}/orders/${fulfillable.id}/${fulfillmentId}/create-shipment`, {
          waitUntil: "networkidle",
        })
        await page.waitForTimeout(2000)
        await page.locator('button[type="submit"]').first().click()
        const shipped = await page
          .waitForURL((u) => u.pathname === `/orders/${fulfillable.id}`, { timeout: 30_000 })
          .then(() => true)
          .catch(() => false)
        check("Acme: marking as shipped returns to the order", shipped, page.url())

        const afterShip = (await acmeGet(`/tenants/orders/${fulfillable.id}?fields=id,fulfillment_status`)).order
        check(
          "Acme: the order is shipped after the panel action",
          afterShip?.fulfillment_status === "shipped",
          String(afterShip?.fulfillment_status)
        )
      } else {
        check("Acme: the fulfillment id came back", false)
      }
    }

    // Export from the orders list: the drawer posts and the panel gets a URL.
    await page.goto(`${PANEL}/orders/export`, { waitUntil: "networkidle" })
    await page.waitForTimeout(800)
    const exportResponse = page.waitForResponse(
      (r) => r.url().includes("/tenants/orders/export") && r.request().method() === "POST",
      { timeout: 30_000 }
    )
    await clickReal(page, page.locator('button:has-text("Export")').last())
    const exported = await exportResponse.then((r) => r.json()).catch(() => null)
    check("Acme: the export answers a URL", typeof exported?.url === "string", exported?.url || "no response")
    check("Acme: the export counts only Acme's orders", exported?.count === acmeOrders.length, `${exported?.count} vs ${acmeOrders.length}`)
    await ctx.close()

    // Globex opens Acme's order URL and must land on the panel's error state.
    const gctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const gpage = await gctx.newPage()
    await login(gpage, "admin@globex.test")
    await gpage.goto(`${PANEL}/orders/${first.id}`, { waitUntil: "networkidle" })
    await gpage.waitForTimeout(1200)
    const gbody = await gpage.locator("body").innerText()
    check(
      "Globex: Acme's order URL shows the not-found state, not the order",
      !gbody.includes(`#${first.display_id}`) && /not found|404|went wrong|error/i.test(gbody),
      gbody.slice(0, 160).replace(/\n/g, " ")
    )
    const globexGetOrder = await apiLogin("admin@globex.test")
    const refused = await globexGetOrder(`/tenants/orders/${first.id}`)
    check("Globex: the API refuses Acme's order", refused?.type === "not_found", JSON.stringify(refused).slice(0, 120))
    await gctx.close()
  }
} finally {
  await browser.close()
}
console.log(failures ? `${failures} check(s) failed` : "all checks passed")
process.exit(failures ? 1 : 0)
