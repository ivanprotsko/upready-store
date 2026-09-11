#!/usr/bin/env node
/**
 * End-to-end acceptance of the tenant panel against a live backend (rule 18f):
 * two tenants log in and each sees only its own products and orders; Acme
 * creates a product from the panel and the storefronts show it only on Acme's;
 * and (wave 2, piece 1) Acme opens one of its products, edits its title and
 * adds a priced variant on the detail screen, while Globex gets the 404 state
 * on that same product URL; and (wave 2, piece 5) Acme creates a category, adds
 * one of its own products to it and reads it back on the category's own screen,
 * while Globex's category list and the category's URL show it nothing.
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
// One stamp for every fixture name in the run (products, variants, categories).
// It lives here, not inside a section: the category section reads it while the
// catalog section is gated off by E2E_ONLY, and a `const` declared inside that
// gate is a ReferenceError from outside it.
//
// The clock part alone is not unique: Medusa derives a product's handle from
// its title and the handle is unique store-wide, so two runs that start in the
// same minute against this shared stand collide with "Product with handle …
// already exists" (measured 2026-09-11 02:13, two worktrees at once). The four
// random characters make the name the run's own.
const stamp = `${new Date().toISOString().slice(11, 16).replace(":", "")}${Math.random()
  .toString(36)
  .slice(2, 6)}`
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
/**
 * The screens render ONE page, the API counts the whole set. `products`/`orders`
 * are the totals (what the footer says), `pageTitles`/`pageOrderIds` are the
 * first page at the screen's own size, which is what the table rows are
 * compared with. Before wave 2 the two were the same number, because Acme had
 * fewer products than a page holds; the accumulated e2e fixtures pushed it past
 * 20 and turned the row comparison permanently red.
 */
const PRODUCT_PAGE_SIZE = 20 // routes/products/product-list/.../product-list-table.tsx
const ORDER_PAGE_SIZE = 20 // routes/orders/order-list/.../order-list-table.tsx

const apiCounts = async (email) => {
  const get = await apiLogin(email)
  const products = await get("/tenants/products?limit=100")
  const orders = await get("/tenants/orders?limit=100")
  const productPage = await get(`/tenants/products?limit=${PRODUCT_PAGE_SIZE}`)
  const orderPage = await get(`/tenants/orders?limit=${ORDER_PAGE_SIZE}`)
  return {
    products: products.count,
    productTitles: (products.products || []).map((p) => p.title),
    pageTitles: (productPage.products || []).map((p) => p.title),
    orders: orders.count,
    orderIds: (orders.orders || []).map((o) => String(o.display_id)),
    pageOrderIds: (orderPage.orders || []).map((o) => String(o.display_id)),
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

/**
 * A client-side route change (React Router) never fires the browser's own
 * "load" event again, so `page.waitForURL` can time out on a navigation that
 * already happened; this resolves true/false on the URL match alone, and
 * never throws, so one flaky wait cannot crash the rest of the script.
 */
const softWaitURL = async (page, matches, timeout = 15_000) =>
  page
    .waitForURL(matches, { timeout, waitUntil: "commit" })
    .then(() => true)
    .catch(() => matches(new URL(page.url())))

const storefrontHasTitle = async (base, title) => {
  await fetch(`${base}/api/revalidate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "product.created" }),
  }).catch(() => {})
  const html = await (await fetch(`${base}/en/store`, { cache: "no-store" })).text()
  return html.includes(title)
}

/**
 * Places a real order for a tenant through the STORE api, with the tenant's own
 * publishable key, and returns its id once the `order.placed` subscriber has
 * linked it (the link is what `/tenants/orders` reads, and it is written
 * asynchronously, so the id is waited for rather than assumed).
 *
 * The fulfil/ship step used to take whatever unfulfilled order the stand
 * happened to hold. That made it consume one order per run, and after six runs
 * there was nothing left to fulfil; it also meant the order's shipping method
 * could belong to a warehouse that is not the tenant's, which is the state the
 * create-fulfillment form cannot submit from. A freshly placed order always
 * carries one of the tenant's own shipping options.
 */
const placeOrderForTenant = async (email) => {
  const get = await apiLogin(email)
  const key = (await get("/tenants/me"))?.tenant_admin?.tenant?.api_key?.token
  const region = (await get("/tenants/regions?limit=1"))?.regions?.[0]
  const product = (await get("/tenants/products?limit=1&fields=id,title,*variants"))?.products?.[0]
  const variant = product?.variants?.[0]

  if (!key || !region?.id || !variant?.id) {
    return null
  }

  const store = async (method, path, body) => {
    const res = await fetch(`${BACKEND}${path}`, {
      method,
      headers: { "content-type": "application/json", "x-publishable-api-key": key },
      body: body ? JSON.stringify(body) : undefined,
    })
    return res.json().catch(() => ({}))
  }

  const { cart } = await store("POST", "/store/carts", {
    region_id: region.id,
    email: `e2e-fulfil-${stamp}@example.com`,
    items: [{ variant_id: variant.id, quantity: 1 }],
  })
  if (!cart?.id) return null

  const option = (await store("GET", `/store/shipping-options?cart_id=${cart.id}`))
    ?.shipping_options?.[0]
  if (!option?.id) return null
  await store("POST", `/store/carts/${cart.id}/shipping-methods`, { option_id: option.id })

  const collection = (await store("POST", "/store/payment-collections", { cart_id: cart.id }))
    ?.payment_collection
  if (!collection?.id) return null
  await store("POST", `/store/payment-collections/${collection.id}/payment-sessions`, {
    provider_id: "pp_system_default",
  })

  const orderId = (await store("POST", `/store/carts/${cart.id}/complete`))?.order?.id
  if (!orderId) return null

  // The tenant-order link is written by a subscriber: give it a bounded wait
  // rather than reading once and calling the order missing.
  for (let attempt = 0; attempt < 10; attempt++) {
    const mine = await get(`/tenants/orders?limit=1&id=${orderId}`)
    if ((mine?.orders || []).length) return orderId
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  return null
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
    check(
      `${t.name}: products table rows = API first page`,
      productRows.length === api.pageTitles.length,
      `${productRows.length} rows vs ${api.pageTitles.length} on the page, ${api.products} in total`
    )
    for (const title of api.pageTitles) {
      check(`${t.name}: product "${title}" is on screen`, productRows.some((r) => r.includes(title)))
    }
    await page.goto(`${PANEL}/orders`)
    const orderRows = await rowsOf(page)
    check(
      `${t.name}: orders table rows = API first page`,
      orderRows.length === api.pageOrderIds.length,
      `${orderRows.length} rows vs ${api.pageOrderIds.length} on the page, ${api.orders} in total`
    )
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
  // Acme has more products than a page holds, and the list is not sorted
  // newest-first, so the fresh one is found the way a person finds it: by
  // searching. `q` is the list's own query parameter.
  await page.goto(`${PANEL}/products?q=${encodeURIComponent(title)}`, { waitUntil: "networkidle" })
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
      // Searched for, not scrolled to: the list shows one page of 20 and Acme
      // has more products than that.
      await page2.goto(`${PANEL}/products?q=${encodeURIComponent(detailTitle)}`, {
        waitUntil: "networkidle",
      })
      await page2.waitForTimeout(1200)
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

  // tenant-panel wave 2, piece 4 (profile + password): from the user menu,
  // open Profile, edit the first name and see it in the shell (the UserBadge
  // reads useMe(), invalidated by useUpdateUser's onSuccess); then change the
  // password, log out, log in with the new one, and restore the original
  // password so every later run (and every other worker on the shared stand)
  // finds admin@acme.test / supersecret exactly as before.
  {
    const ORIGINAL_FIRST_NAME = "Ada"
    const STAMPED_FIRST_NAME = `Ada-e2e-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}`
    const TEMP_PASSWORD = "e2e-temp-password-1"

    // The shared stand's admin@acme.test / supersecret is used by every
    // worker's own verification, so a thrown check here must not leave it
    // mid-change: this finally block tries both possible current passwords
    // and restores PASSWORD + ORIGINAL_FIRST_NAME through the API directly,
    // never through the UI, so it cannot itself get stuck on a selector.
    const restoreViaApi = async () => {
      for (const candidate of [TEMP_PASSWORD, PASSWORD]) {
        const login = await fetch(`${BACKEND}/auth/tenant/emailpass`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "admin@acme.test", password: candidate }),
        })
        if (!login.ok) continue
        const { token } = await login.json()
        const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" }
        if (candidate !== PASSWORD) {
          await fetch(`${BACKEND}/tenants/me/password`, {
            method: "POST",
            headers: auth,
            body: JSON.stringify({ current_password: candidate, new_password: PASSWORD }),
          })
        }
        await fetch(`${BACKEND}/tenants/me`, {
          method: "POST",
          headers: auth,
          body: JSON.stringify({ first_name: ORIGINAL_FIRST_NAME, metadata: null }),
        })
        return true
      }
      return false
    }

    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    try {
      await login(page, "admin@acme.test")

      // The user-menu trigger is the second `aria-haspopup="menu"` element in
      // the shell (index 0: sidebar collapse, 1: this trigger), a stabler
      // handle than its text once the profile edit below changes that text.
      await clickReal(page, page.locator('[aria-haspopup="menu"]').nth(1))
      await clickReal(page, page.getByText("Profile settings").first())
      const onProfile = await softWaitURL(page, (u) => u.pathname.endsWith("/settings/profile"))
      check("profile: user-menu link opens /settings/profile", onProfile, page.url())
      if (!onProfile) await page.goto(`${PANEL}/settings/profile`, { waitUntil: "networkidle" })
      await page.waitForLoadState("networkidle")

      // The ActionMenu ellipsis on ProfileGeneralSection is the third
      // `aria-haspopup="menu"` trigger on this page (sidebar collapse, the
      // shell's own user menu, then this section's), only mounted once
      // `useMe()` resolves past the section's loading skeleton.
      const editTrigger = page.locator('[aria-haspopup="menu"]').nth(2)
      await editTrigger.waitFor({ state: "visible", timeout: 15_000 })
      await clickReal(page, editTrigger)
      await clickReal(page, page.getByText("Edit", { exact: true }).first())
      const onEdit = await softWaitURL(page, (u) => u.pathname.endsWith("/settings/profile/edit"))
      if (!onEdit) await page.goto(`${PANEL}/settings/profile/edit`, { waitUntil: "networkidle" })
      // The drawer's `open` state (and its form) mounts an animation tick after
      // the URL changes; wait for the field before filling, or `fillEverywhere`
      // silently no-ops on a zero-count selector and the submit re-saves the
      // unchanged name.
      await page.locator('input[name="first_name"]').first().waitFor({ state: "visible", timeout: 15_000 })
      // The Vaul/Radix drawer is still visually sliding in when the field
      // becomes "visible" by Playwright's own definition; a click computed
      // from its still-animating bounding box can miss the real Save button
      // (measured: intermittent on this exact step, never on a fresh script).
      await page.waitForTimeout(500)
      await fillEverywhere(page, 'input[name="first_name"]', STAMPED_FIRST_NAME)
      // The change-password section's own "Save" button sits in the same page,
      // outside this drawer; scope to `[role="dialog"]` (the drawer, portalled
      // to the end of <body>) so `.first()` cannot pick the wrong one.
      await clickReal(page, page.locator('[role="dialog"] button[type="submit"]').first())
      const backOnProfile = await softWaitURL(page, (u) => u.pathname.endsWith("/settings/profile"))
      check("profile: edit form submit returns to /settings/profile", backOnProfile, page.url())
      if (!backOnProfile) await page.goto(`${PANEL}/settings/profile`, { waitUntil: "networkidle" })

      const shownInShell = await page
        .getByText(STAMPED_FIRST_NAME, { exact: false })
        .first()
        .waitFor({ timeout: 15_000 })
        .then(() => true)
        .catch(() => false)
      check("profile: edited first name shows in the shell (UserBadge)", shownInShell)

      const passwordInputs = page.locator('input[type="password"]')
      await passwordInputs.nth(0).fill(PASSWORD)
      await passwordInputs.nth(1).fill(TEMP_PASSWORD)
      await passwordInputs.nth(2).fill(TEMP_PASSWORD)
      await clickReal(page, page.locator('button:has-text("Save")').last())
      const passwordToastOk = await page
        .getByText("Password changed", { exact: false })
        .first()
        .waitFor({ timeout: 15_000 })
        .then(() => true)
        .catch(() => false)
      check("profile: change-password shows a success toast", passwordToastOk)

      await clickReal(page, page.locator('[aria-haspopup="menu"]').nth(1))
      await clickReal(page, page.getByText("Log out", { exact: false }).first())
      const onLogin = await softWaitURL(page, (u) => u.pathname.endsWith("/login"))
      check("profile: log out returns to /login", onLogin, page.url())
      if (!onLogin) await page.goto(`${PANEL}/login`, { waitUntil: "networkidle" })

      const oldPasswordRejected = await fetch(`${BACKEND}/auth/tenant/emailpass`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "admin@acme.test", password: PASSWORD }),
      }).then((r) => r.status === 401)
      check("profile: the old password no longer logs in (API)", oldPasswordRejected)

      await page.locator('input[name="email"]').fill("admin@acme.test")
      await page.locator('input[name="password"]').fill(TEMP_PASSWORD)
      await page.locator('button[type="submit"]').first().click()
      const loggedInWithNew = await softWaitURL(page, (u) => !u.pathname.endsWith("/login"))
      check("profile: logs in with the new password", loggedInWithNew)

      // Restore through the UI (proves the same form works both ways); the
      // `finally` below repeats it through the API regardless, so a failure in
      // this UI pass still leaves the stand's password and name correct.
      await page.goto(`${PANEL}/settings/profile`, { waitUntil: "networkidle" })
    const restorePasswordInputs = page.locator('input[type="password"]')
    await restorePasswordInputs.nth(0).fill(TEMP_PASSWORD)
    await restorePasswordInputs.nth(1).fill(PASSWORD)
    await restorePasswordInputs.nth(2).fill(PASSWORD)
    await clickReal(page, page.locator('button:has-text("Save")').last())
    await page
      .getByText("Password changed", { exact: false })
      .first()
      .waitFor({ timeout: 15_000 })
      .catch(() => {})
    await restoreViaApi()

    const restoreGet = await apiLogin("admin@acme.test")
    const meAfterRestore = await restoreGet("/tenants/me")
    check(
      "profile: original password and first name restored",
      meAfterRestore?.tenant_admin?.first_name === ORIGINAL_FIRST_NAME,
      JSON.stringify(meAfterRestore?.tenant_admin?.first_name)
    )
    check("profile: original password logs in again (API)", Boolean(meAfterRestore))
    } finally {
      await restoreViaApi()
      await ctx.close()
    }
  }
  } // tenant-panel: closes the runs("catalog") gate piece 2 opened around the catalog, product-detail and profile sections (merge of pieces 1+4 with 2+3)

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
    // The order to fulfil is placed by this run, not borrowed from the stand:
    // see `placeOrderForTenant`.
    const placedId = await placeOrderForTenant("admin@acme.test")
    check("Acme: a storefront order was placed for the fulfil flow", !!placedId, placedId || "not placed")
    const fulfillable = placedId
      ? (await acmeGet(`/tenants/orders/${placedId}?fields=id,display_id,fulfillment_status`)).order
      : null

    if (!fulfillable) {
      check("Acme: an order is available to fulfil", false, "no order to fulfil")
    } else {
      console.log(`fulfilling order ${fulfillable.id} #${fulfillable.display_id}`)
      await page.goto(`${PANEL}/orders/${fulfillable.id}/fulfillment`, { waitUntil: "networkidle" })
      await page.waitForTimeout(2500)

      // The form configures itself from the order's OWN shipping method, but
      // only once that option is among the ones it fetched: `useShippingOptions`
      // asks for one default page and this stand carries 492 options, so the
      // order's own is sometimes missing from it. When that happens the
      // warehouse is chosen first, which refetches the options narrowed to it.
      //
      // Measured on :9029, 2026-09-11: choosing a warehouse that does NOT own
      // the order's shipping option leaves `shipping_option_id` pointing at an
      // option the refetched list no longer holds. The submit button stays
      // enabled (it only checks that the id is set), the handler's own
      // `shipping_options.find(...)` misses, and it returns with the field error
      // "Shipping option is required" and NO request. That is what broke the
      // trunk run on order #3, whose method is "Pickup" at the default
      // warehouse: the step used to pick Acme's warehouse unconditionally.
      const methodValue = async () =>
        (await page.locator('[role="dialog"] button[role="combobox"]').first().innerText().catch(() => "")).trim()

      if (!(await methodValue())) {
        const locationBox = page.locator('input[role="combobox"]').first()
        await locationBox.click()
        await locationBox.pressSequentially("Acme warehouse", { delay: 60 })
        await page.waitForTimeout(2500)
        const options = await page.locator('[role="option"]:visible').allInnerTexts()
        check("fulfillment form: the tenant's warehouse is offered", options.length > 0, options.join(", "))
        await page.locator('[role="option"]:visible').first().click()
        await page.waitForTimeout(3500)
      }

      // Whatever the location ended up being, the method has to name an option
      // of THAT location, so it is chosen explicitly when it is not already set.
      if (!(await methodValue())) {
        await clickReal(page, page.locator('[role="dialog"] button[role="combobox"]').first())
        await page.waitForTimeout(1500)
        const methods = await page.locator('[role="option"]:visible').allInnerTexts()
        check("fulfillment form: a shipping method is offered", methods.length > 0, methods.join(", "))
        await page.locator('[role="option"]:visible').first().click()
        await page.waitForTimeout(1500)
      }
      check("fulfillment form: a shipping method is selected", !!(await methodValue()), await methodValue())

      const submit = page.locator('button[type="submit"]').first()
      check("fulfillment form: the submit button is enabled", await submit.isEnabled())
      await submit.click()
      const fulfilled = await page
        .waitForURL((u) => u.pathname === `/orders/${fulfillable.id}`, { timeout: 30_000 })
        .then(() => true)
        .catch(() => false)
      // A form that refuses client-side sends no request and stays put. Read
      // its own message into the failure, so a silent refusal never looks like
      // a dead button.
      const formError = fulfilled
        ? ""
        : await page
            .locator('[role="dialog"] [role="alert"], [role="dialog"] .text-ui-fg-error')
            .allInnerTexts()
            .then((t) => t.join(" / "))
            .catch(() => "")
      check(
        "Acme: creating a fulfillment returns to the order",
        fulfilled,
        formError ? `${page.url()} — form says: ${formError}` : page.url()
      )

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
    // Counted fresh: this run placed an order after `acmeOrders` was read.
    const acmeCountNow = (await acmeGet("/tenants/orders?limit=1")).count
    check("Acme: the export counts only Acme's orders", exported?.count === acmeCountNow, `${exported?.count} vs ${acmeCountNow}`)
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
  // ---- wave 2, piece 5: categories. The category the panel creates is the
  // subject, and it is deleted again at the end: Medusa derives the handle from
  // the name and the handle is unique, so a kept fixture would make the next run
  // fail on a constraint rather than on a regression. The name carries the same
  // clock stamp the product fixtures use, for the same reason.
  {
    const acme = await apiLogin("admin@acme.test")
    const globex = await apiLogin("admin@globex.test")
    const categoryName = `Night 2 cat ${stamp}`

    const before = await acme("/tenants/product-categories?limit=100")
    const productsOfAcme = await acme("/tenants/products?limit=1&fields=id,title")
    const productForCategory = productsOfAcme.products?.[0]
    check(
      "Acme: a product exists to put into the category",
      !!productForCategory?.id,
      productForCategory?.title
    )

    const cctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const cpage = await cctx.newPage()
    await login(cpage, "admin@acme.test")

    await cpage.goto(`${PANEL}/categories`, { waitUntil: "networkidle" })
    await cpage.waitForTimeout(800)
    const listBefore = await cpage.locator("body").innerText()
    check(
      "Acme: the categories screen renders its own list, not a 404",
      !listBefore.includes("404"),
      cpage.url()
    )

    // Create: the Admin's RouteFocusModal with two progress tabs (details,
    // organize); the submit button only exists on the second tab.
    await cpage.goto(`${PANEL}/categories/create`, { waitUntil: "networkidle" })
    await cpage.waitForTimeout(1000)
    await fillEverywhere(cpage, '[role="dialog"] input[name="name"]', categoryName)
    await cpage.waitForTimeout(300)
    await clickReal(cpage, cpage.locator('[role="dialog"] button:has-text("Continue")').first())
    await cpage.waitForTimeout(800)
    await clickReal(cpage, cpage.locator('[role="dialog"] button:has-text("Save")').first())
    const landedOnCategory = await cpage
      .waitForURL((u) => /^\/categories\/pcat_/.test(u.pathname), { timeout: 20_000 })
      .then(() => true)
      .catch(() => false)
    check("Acme: creating a category lands on its detail screen", landedOnCategory, cpage.url())

    const categoryId = new URL(cpage.url()).pathname.split("/")[2]
    const afterCreate = await acme("/tenants/product-categories?limit=100")
    check(
      "Acme: the API lists one more category than before",
      afterCreate.count === before.count + 1,
      `${before.count} → ${afterCreate.count}`
    )
    check(
      "Acme: the new category is the one the panel created",
      (afterCreate.product_categories || []).some((c) => c.id === categoryId && c.name === categoryName),
      categoryId
    )

    await cpage.waitForTimeout(1500)
    const detailText = await cpage.locator("body").innerText()
    check("Acme: the category detail screen shows its name", detailText.includes(categoryName))

    // Add one owned product through the products modal: a checkbox per row, then Save.
    if (categoryId && productForCategory?.id) {
      await cpage.goto(`${PANEL}/categories/${categoryId}/products`, { waitUntil: "networkidle" })
      // The modal's product table is a second list request on top of the
      // category retrieve, and the form only mounts once both settle.
      await cpage
        .locator('[role="dialog"] table tbody tr')
        .first()
        .waitFor({ state: "visible", timeout: 30_000 })
      await cpage.waitForTimeout(600)
      const row = cpage.locator(`[role="dialog"] table tbody tr:has-text("${productForCategory.title}")`).first()
      await clickReal(cpage, row.locator('button[role="checkbox"]').first())
      await cpage.waitForTimeout(400)
      await clickReal(cpage, cpage.locator('[role="dialog"] button:has-text("Save")').first())
      await cpage
        .waitForURL((u) => u.pathname === `/categories/${categoryId}`, { timeout: 20_000 })
        .catch(() => {})
      await cpage.waitForTimeout(2500)
      const withProduct = await cpage.locator("body").innerText()
      check(
        "Acme: the added product is on the category's own screen",
        withProduct.includes(productForCategory.title),
        cpage.url()
      )

      const linked = await acme(
        `/tenants/product-categories/${categoryId}?fields=id,name,products.id`
      )
      check(
        "Acme: the API returns the product inside the category",
        (linked.product_category?.products || []).some((pr) => pr.id === productForCategory.id),
        JSON.stringify(linked.product_category?.products || [])
      )
    }

    // And the tenant's own catalog list now offers the category as a filter
    // value: the organize combobox reads the same scoped route.
    await cpage.goto(`${PANEL}/products/create`, { waitUntil: "networkidle" })
    await cpage.waitForTimeout(1200)
    await cctx.close()

    // Globex: not in the list, and the URL is the 404 state.
    const gctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const gpage2 = await gctx2.newPage()
    await login(gpage2, "admin@globex.test")
    await gpage2.goto(`${PANEL}/categories`, { waitUntil: "networkidle" })
    await gpage2.waitForTimeout(1500)
    const globexList = await gpage2.locator("body").innerText()
    check("Globex: the categories list does not show Acme's category", !globexList.includes(categoryName))

    if (categoryId) {
      await gpage2.goto(`${PANEL}/categories/${categoryId}`, { waitUntil: "networkidle" })
      await gpage2.waitForTimeout(2500)
      const globexDetail = await gpage2.locator("body").innerText()
      check("Globex: Acme's category URL renders the 404 state", globexDetail.includes("404"))
      check("Globex: Acme's category name is nowhere on that screen", !globexDetail.includes(categoryName))
    }
    await gctx2.close()

    const globexApi = await globex("/tenants/product-categories?limit=100")
    check(
      "Globex: the API does not return Acme's category either",
      !(globexApi.product_categories || []).some((c) => c.id === categoryId),
      `Globex count ${globexApi.count}`
    )

    if (categoryId) {
      const removed = await acme(`/tenants/product-categories/${categoryId}`, { method: "DELETE" })
      check("Acme: the category fixture is deleted again", removed?.deleted === true, JSON.stringify(removed).slice(0, 120))
      const after = await acme("/tenants/product-categories?limit=100")
      check("Acme: the category count is back where it started", after.count === before.count, `${after.count} vs ${before.count}`)
    }
  }

  // ---- wave 2, piece 9: the Domains screen ---------------------------------
  // `E2E_ONLY=domains` runs this section alone. The screen is the panel's own
  // (no Admin counterpart): a shop's built-in `<handle>.<platform domain>`
  // addresses, read-only because they have no database row, plus the custom
  // hosts it adds and removes (docs/multitenancy/storefront-by-host.md §2).
  if (runs("domains")) {
    const customHost = `e2e-${stamp}.example`
    // Its own API client: `acmeGet` above lives inside the orders section's
    // block, and `E2E_ONLY=domains` never enters that block.
    const acmeApiGet = await apiLogin("admin@acme.test")

    const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const dpage = await dctx.newPage()
    await login(dpage, "admin@acme.test")

    // The Overview links into it, which is how a shop owner finds the screen.
    await dpage.goto(`${PANEL}/`, { waitUntil: "networkidle" })
    await dpage.waitForTimeout(600)
    const domainsLink = dpage.getByRole("link", { name: /^domains$/i }).first()
    check("Acme: the Overview links to Domains", (await domainsLink.count()) > 0)
    await domainsLink.click()
    await dpage.waitForURL((u) => u.pathname === "/settings/domains", { timeout: 20_000 })
    await dpage.waitForTimeout(1200)

    const technicalText = await dpage.locator("body").innerText()
    check(
      "Acme: the screen shows the shop's built-in addresses",
      technicalText.includes("acme.upready.dev") && technicalText.includes("acme.localhost"),
      technicalText.slice(0, 160).replace(/\s+/g, " ")
    )
    check(
      "Acme: the built-in addresses carry no remove control",
      (await dpage.getByRole("button", { name: /Remove acme\.(upready\.dev|localhost)/i }).count()) === 0
    )

    await dpage.locator('input[name="host"]').fill(customHost)
    await dpage.getByRole("button", { name: /add domain/i }).first().click()
    await dpage.waitForTimeout(2000)
    const afterAdd = await dpage.locator("body").innerText()
    check("Acme: the added domain is on the screen", afterAdd.includes(customHost), customHost)

    const acmeApi = await acmeApiGet("/tenants/domains")
    check(
      "Acme: the API returns the same domain",
      (acmeApi.domains || []).some((d) => d.host === customHost),
      JSON.stringify(acmeApi.domains || [])
    )

    // The storefront resolver answers on it straight away — that is the point
    // of the row existing at all.
    const resolved = await fetch(
      `${BACKEND}/storefront/by-host?host=${encodeURIComponent(customHost)}`
    )
    const resolvedBody = await resolved.json()
    check(
      "Acme: the storefront resolver serves the new host with no restart",
      resolved.status === 200 && resolvedBody.tenant?.handle === "acme",
      `HTTP ${resolved.status}, handle ${resolvedBody.tenant?.handle}`
    )

    // Globex: its own built-in addresses, and nothing of Acme's.
    const gctx3 = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const gpage3 = await gctx3.newPage()
    await login(gpage3, "admin@globex.test")
    await gpage3.goto(`${PANEL}/settings/domains`, { waitUntil: "networkidle" })
    await gpage3.waitForTimeout(1500)
    const globexText = await gpage3.locator("body").innerText()
    check(
      "Globex: the screen shows Globex's own built-in addresses",
      globexText.includes("globex.upready.dev")
    )
    check("Globex: Acme's domain is nowhere on it", !globexText.includes(customHost))
    check("Globex: Acme's built-in address is nowhere on it", !globexText.includes("acme.upready.dev"))

    // And a shop cannot take a host another shop holds.
    const globexApi = await apiLogin("admin@globex.test")
    const stolen = await globexApi("/tenants/domains", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ host: customHost }),
    })
    check(
      "Globex: taking Acme's host is refused as a duplicate",
      stolen?.type === "duplicate_error",
      JSON.stringify(stolen).slice(0, 140)
    )
    await gctx3.close()

    // Remove it again from the screen, so the stand does not accumulate hosts.
    await dpage.reload({ waitUntil: "networkidle" })
    await dpage.waitForTimeout(1200)
    const removeButton = dpage.getByRole("button", {
      name: new RegExp(`Remove ${customHost}`, "i"),
    })
    await removeButton.first().click()
    await dpage.waitForTimeout(2000)
    // The row is gone when its own remove control is gone. Reading the whole
    // body would still find the host in the success toast, which names it.
    check(
      "Acme: the removed domain is gone from the screen",
      (await removeButton.count()) === 0,
      `${await removeButton.count()} remove control(s) left`
    )

    const goneResolver = await fetch(
      `${BACKEND}/storefront/by-host?host=${encodeURIComponent(customHost)}`
    )
    check(
      "Acme: the storefront resolver stops serving the removed host",
      goneResolver.status === 404,
      `HTTP ${goneResolver.status}`
    )
    await dctx.close()
  }

} finally {
  await browser.close()
}
console.log(failures ? `${failures} check(s) failed` : "all checks passed")
process.exit(failures ? 1 : 0)
