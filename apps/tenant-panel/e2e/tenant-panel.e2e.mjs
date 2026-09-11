#!/usr/bin/env node
/**
 * End-to-end acceptance of the tenant panel against a live backend (rule 18f):
 * two tenants log in and each sees only its own products and orders; Acme
 * creates a product from the panel and the storefronts show it only on Acme's;
 * and (wave 2, piece 1) Acme opens one of its products, edits its title and
 * adds a priced variant on the detail screen, while Globex gets the 404 state
 * on that same product URL. Wave 2, piece 6 adds promotions and campaigns: Acme
 * creates a percentage promotion with a code from the panel and finds the forced
 * sales-channel rule on its detail screen, while Globex's list stays empty and
 * that promotion's URL answers the not-found screen for it.
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
/** The Admin's product and order tables ask for 20 rows a page; the screen checks compare against one page. */
const PAGE_SIZE = 20
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
    // The table pages at 20 rows and Acme's catalog grows by two on every run of
    // this script, so the screen is compared with ONE page of the API's list, not
    // with the total. Beyond that page the claim under test is the same one the
    // cross-tenant block makes below: every row on screen is this tenant's own.
    check(
      `${t.name}: products table rows = one page of the API list`,
      productRows.length === Math.min(api.products, PAGE_SIZE),
      `${productRows.length} vs ${api.products} (page size ${PAGE_SIZE})`
    )
    const ownTitles = new Set(api.productTitles)
    const foreignRow = productRows.find((row) => ![...ownTitles].some((title) => row.includes(title)))
    check(`${t.name}: every product row on screen is the tenant's own`, !foreignRow, foreignRow?.split("\n")[0])
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
  // Several workers run this script against the same stand at the same time, so
  // the stamp carries a per-process suffix: an HH:MM stamp alone gives two runs
  // in the same minute the same product titles, and then each one finds the
  // other's fixtures.
  const stamp = `${new Date().toISOString().slice(11, 16).replace(":", "")}${Math.random()
    .toString(36)
    .slice(2, 6)}`
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
  // Ask the list for this title: the table pages at 20 rows and its order is not
  // newest-first, so a fresh product is not reliably on the page the publish
  // redirect lands on.
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
      // the screen under test. The list pages at 20 rows and Acme's catalog has
      // long passed that, so the list is asked for this title first; without the
      // `q` the fixture sits on a later page and the row never appears.
      await page2.goto(`${PANEL}/products?q=${encodeURIComponent(detailTitle)}`, {
        waitUntil: "networkidle",
      })
      await page2.waitForTimeout(1200)
      // `has-text` is a substring match and `q` is a prefix search, so a
      // neighbour run's fixture can sit in this filtered list too. The row is
      // picked by an exact title line, which only this fixture has.
      const listRows = page2.locator("table tbody tr")
      const rowCount = await listRows.count()
      let targetRow = -1
      for (let i = 0; i < rowCount; i++) {
        const lines = (await listRows.nth(i).innerText()).split("\n").map((line) => line.trim())
        if (lines.includes(detailTitle)) {
          targetRow = i
          break
        }
      }
      check("Acme: the fixture has a row in the filtered list", targetRow >= 0, `${rowCount} rows`)
      if (targetRow >= 0) {
        await listRows.nth(targetRow).click()
      }
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
      // By id, not by title: `q` is a substring search and several workers run
      // this script against the same stand, so a neighbour's fixture created in
      // the same minute shares this title's prefix and would read as "not gone".
      const gone = await acme(`/tenants/products?id=${target.id}`)
      check(
        "Acme: the detail fixture is deleted again",
        !(gone.products || []).some((row) => row.id === target.id),
        `${gone.count} rows for that id`
      )
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

  // ---- wave 2, piece 6: promotions and campaigns ----------------------------
  // Acme creates a percentage promotion with a code from the panel, finds it in
  // the list and on the detail screen with the sales-channel rule the backend
  // forces, and Globex sees none of it. The rule is checked twice on purpose:
  // once as the words the operator reads on the screen ("Sales Channel",
  // "Acme"), once as the row the API returns, because a rule that renders and a
  // rule that is stored are two different claims.
  {
    const stamp = Date.now().toString(36).toUpperCase()
    const CODE = `E2E${stamp}`
    const CAMPAIGN_NAME = `E2E campaign ${stamp}`
    const CAMPAIGN_ID = `e2e-${stamp.toLowerCase()}`
    const acme = await apiLogin("admin@acme.test")
    const globex = await apiLogin("admin@globex.test")
    const me = await acme("/tenants/me")
    const acmeChannelId = me?.tenant_admin?.tenant?.sales_channel?.id
    const acmeChannelName = me?.tenant_admin?.tenant?.sales_channel?.name
    check("promotions: the tenant has a sales channel to scope by", Boolean(acmeChannelId), String(acmeChannelId))

    const beforeApi = await acme("/tenants/promotions?limit=100")
    const campaignsApi = await acme("/tenants/campaigns?limit=100")

    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    let createdId = null
    let createdCampaign = null
    try {
      await login(page, "admin@acme.test")

      await page.goto(`${PANEL}/promotions`, { waitUntil: "networkidle" })
      const listRows = await rowsOf(page)
      check(
        "promotions: the list shows exactly the tenant's own promotions",
        listRows.length === beforeApi.count,
        `screen ${listRows.length}, api ${beforeApi.count}`
      )

      await page.goto(`${PANEL}/campaigns`, { waitUntil: "networkidle" })
      const campaignRows = await rowsOf(page)
      check(
        "campaigns: the list shows exactly the tenant's own campaigns",
        campaignRows.length === campaignsApi.count,
        `screen ${campaignRows.length}, api ${campaignsApi.count}`
      )

      // Create: template tab -> details tab -> campaign tab -> Save. The
      // "Percentage off order" template is the one that needs no target rules,
      // so the form is complete with a code and a value.
      await page.goto(`${PANEL}/promotions/create`, { waitUntil: "networkidle" })
      await page.waitForTimeout(1000)
      await clickReal(page, page.getByText("Percentage off order", { exact: false }).first())
      await clickReal(page, page.locator('button:has-text("Continue")').first())
      await page.waitForTimeout(800)
      await fillEverywhere(page, 'input[name="code"]', CODE)
      await fillEverywhere(page, 'input[name="application_method.value"]', "15")
      // The status choice is a RadioGroup.ChoiceBox: its `input[name="status"]`
      // is visually hidden, so the click has to land on the box that carries the
      // "Active" label. Without this the promotion is created as a Draft.
      await clickReal(page, page.getByText("Customers will be able to use the code").first())
      await clickReal(page, page.locator('button:has-text("Continue")').first())
      await page.waitForTimeout(800)
      await clickReal(page, page.locator('button:has-text("Save")').first())

      const onDetail = await softWaitURL(page, (u) => /\/promotions\/promo_/.test(u.pathname), 30_000)
      check("promotions: create lands on the new promotion's detail screen", onDetail, page.url())

      await page.waitForLoadState("networkidle")
      await page.waitForTimeout(800)
      const detailText = await page.locator("body").innerText()
      check("promotions: the detail screen shows the created code", detailText.includes(CODE))
      check(
        "promotions: the detail screen shows the forced sales-channel rule",
        detailText.includes("Sales Channel") && detailText.includes(acmeChannelName),
        `channel "${acmeChannelName}"`
      )

      const afterApi = await acme("/tenants/promotions?limit=100")
      const created = (afterApi.promotions || []).find((row) => row.code === CODE)
      createdId = created?.id ?? null
      check("promotions: the API lists the promotion the panel created", Boolean(created), String(createdId))
      check(
        "promotions: the promotion was created Active, as the form was filled",
        created?.status === "active",
        String(created?.status)
      )
      const channelRule = (created?.rules || []).find((rule) => rule.attribute === "sales_channel_id")
      check(
        "promotions: the created promotion carries the tenant's sales-channel rule",
        Boolean(channelRule) &&
          channelRule.operator === "eq" &&
          (channelRule.values || []).map((v) => v.value).join(",") === acmeChannelId,
        JSON.stringify(channelRule)
      )

      await page.goto(`${PANEL}/promotions`, { waitUntil: "networkidle" })
      const afterRows = await rowsOf(page)
      check(
        "promotions: the new code shows in the list",
        afterRows.some((row) => row.includes(CODE)),
        `${afterRows.length} rows`
      )

      // Campaigns: one screen, one form, the same ownership rule. The campaign
      // is created from the panel rather than through the API so the screenshot
      // pair below has a row to show and the create form is actually exercised.
      await page.goto(`${PANEL}/campaigns/create`, { waitUntil: "networkidle" })
      await page.waitForTimeout(1000)
      await fillEverywhere(page, 'input[name="name"]', CAMPAIGN_NAME)
      await fillEverywhere(page, 'input[name="campaign_identifier"]', CAMPAIGN_ID)
      await fillEverywhere(page, 'input[name="budget.limit"]', "100")
      await clickReal(page, page.locator('button:has-text("Create")').first())

      const onCampaign = await softWaitURL(page, (u) => /\/campaigns\/procamp_/.test(u.pathname), 30_000)
      check("campaigns: create lands on the new campaign's detail screen", onCampaign, page.url())
      await page.waitForLoadState("networkidle")
      await page.waitForTimeout(800)
      const campaignText = await page.locator("body").innerText()
      check(
        "campaigns: the detail screen shows the created campaign",
        campaignText.includes(CAMPAIGN_NAME) && campaignText.includes(CAMPAIGN_ID)
      )

      const campaignsAfter = await acme("/tenants/campaigns?limit=100")
      createdCampaign = (campaignsAfter.campaigns || []).find((row) => row.name === CAMPAIGN_NAME)
      check(
        "campaigns: the API lists the campaign the panel created",
        Boolean(createdCampaign),
        String(createdCampaign?.id)
      )
    } finally {
      await ctx.close()
    }

    const otherCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const otherPage = await otherCtx.newPage()
    try {
      await login(otherPage, "admin@globex.test")

      await otherPage.goto(`${PANEL}/promotions`, { waitUntil: "networkidle" })
      const theirRows = await rowsOf(otherPage)
      check(
        "promotions: the other tenant's list does not show the code",
        !theirRows.some((row) => row.includes(CODE)),
        `${theirRows.length} rows`
      )

      // Isolation is "Acme's rows are absent", not "the list is empty": Globex
      // may own promotions of its own, and an emptiness check would go red on
      // stand state that has nothing to do with this piece.
      const theirApi = await globex("/tenants/promotions?limit=100")
      check(
        "promotions: the other tenant's API list does not carry the code",
        !(theirApi.promotions || []).some((row) => row.code === CODE),
        `count ${theirApi.count}`
      )

      if (createdId) {
        await otherPage.goto(`${PANEL}/promotions/${createdId}`, { waitUntil: "networkidle" })
        await otherPage.waitForTimeout(1500)
        const text = await otherPage.locator("body").innerText()
        check(
          "promotions: the other tenant gets the not-found screen on that promotion",
          text.includes("404") || text.toLowerCase().includes("no page at this address"),
          text.slice(0, 120).replace(/\n+/g, " ")
        )
      }

      const theirCampaigns = await globex("/tenants/campaigns?limit=100")
      check(
        "campaigns: the other tenant's list does not carry Acme's new campaign",
        !(theirCampaigns.campaigns || []).some((row) => row.id === createdCampaign?.id),
        `their count ${theirCampaigns.count}`
      )

      if (createdCampaign) {
        await otherPage.goto(`${PANEL}/campaigns/${createdCampaign.id}`, { waitUntil: "networkidle" })
        await otherPage.waitForTimeout(1500)
        const campaignText = await otherPage.locator("body").innerText()
        check(
          "campaigns: the other tenant gets the not-found screen on that campaign",
          campaignText.includes("404") || campaignText.toLowerCase().includes("no page at this address"),
          campaignText.slice(0, 120).replace(/\n+/g, " ")
        )
      }
    } finally {
      await otherCtx.close()
    }

    if (process.env.E2E_CLEANUP === "1") {
      if (createdId) {
        await acme(`/tenants/promotions/${createdId}`, { method: "DELETE" })
        const afterDelete = await acme("/tenants/promotions?limit=100")
        check(
          "promotions: cleanup removed the created promotion",
          !(afterDelete.promotions || []).some((row) => row.code === CODE)
        )
      }
      if (createdCampaign) {
        await acme(`/tenants/campaigns/${createdCampaign.id}`, { method: "DELETE" })
        const afterDelete = await acme("/tenants/campaigns?limit=100")
        check(
          "campaigns: cleanup removed the created campaign",
          !(afterDelete.campaigns || []).some((row) => row.id === createdCampaign.id)
        )
      }
    }
  }
} finally {
  await browser.close()
}
console.log(failures ? `${failures} check(s) failed` : "all checks passed")
process.exit(failures ? 1 : 0)
