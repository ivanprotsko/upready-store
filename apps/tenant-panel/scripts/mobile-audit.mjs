#!/usr/bin/env node
/**
 * t-2026-10-13-30: the mobile layout audit of the tenant panel and the platform
 * panel (Medusa Admin at /app), one command. Ivan, 13.10: «в мобильной версии
 * на странице https://panel.cherkashino.ru/courses поломана верстка, таблица не
 * помещается по ширине … нужно проверить все страницы панели тенантов и
 * платформы».
 *
 *   MOBILE_AUDIT_OWNER_EMAIL=… MOBILE_AUDIT_OWNER_PASSWORD=… \
 *   MOBILE_AUDIT_ADMIN_EMAIL=… MOBILE_AUDIT_ADMIN_PASSWORD=… \
 *   node apps/tenant-panel/scripts/mobile-audit.mjs \
 *     --panel http://localhost:5700 --admin http://localhost:9700/app \
 *     --out /abs/dir [--widths 390,768,1280] [--shot-widths 390] \
 *     [--themes light] [--only courses,products] [--strict]
 *
 * For every route and width it opens the page in its own headless Chromium
 * (never a person's browser) and records:
 *   - docOverflow: `document.documentElement.scrollWidth > innerWidth`;
 *   - shellOverflow: the shell's own scroller (`main` and its ancestors — the
 *     panel's shell scrolls inside `main`, so the document alone never shows
 *     it) scrolls sideways;
 *   - offenders: the outermost elements whose box leaves [0, innerWidth] and
 *     that no scroll/clip container below `main` holds — the ones that push
 *     the page. A table inside an `overflow-x-auto` wrapper is not one;
 *   - menuReachable (below 1024 px): the button that opens the side menu is on
 *     screen;
 *   - wrappedCells: `td`/`th` taller than one and a half lines (Ivan's rule of
 *     t-2026-09-25-18: a table cell holds one line).
 * Screenshots go to `<out>/<app>/<slug>-<width>-<theme>.png`, the numbers to
 * `<out>/audit.json`, a table to stdout. With --strict the exit code is 1 when
 * any page overflows, so the audit doubles as a gate.
 *
 * Logins come from the environment only; this file holds none. Playwright is
 * resolved from MOBILE_AUDIT_PLAYWRIGHT (a directory), then the usual
 * node_modules lookup from this file and from the current directory.
 */
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))

export function parseArgs(argv) {
  const o = {
    widths: [390, 768, 1280],
    shotWidths: [390],
    themes: ["light"],
    only: null,
    strict: false,
    settleMs: 700,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const val = () => argv[++i]
    const nums = (s) => s.split(",").map((x) => Number(x.trim())).filter((n) => n > 0)
    if (a === "--panel") o.panel = val()
    else if (a === "--admin") o.admin = val()
    else if (a === "--out") o.out = val()
    else if (a === "--widths") o.widths = nums(val())
    else if (a === "--shot-widths") o.shotWidths = nums(val())
    else if (a === "--themes") o.themes = val().split(",").map((s) => s.trim()).filter(Boolean)
    else if (a === "--only") o.only = val().split(",").map((s) => s.trim()).filter(Boolean)
    else if (a === "--settle-ms") o.settleMs = Number(val())
    else if (a === "--strict") o.strict = true
    else throw new Error(`unknown flag ${a}`)
  }
  if (!o.panel && !o.admin) throw new Error("--panel or --admin is required")
  if (!o.out || !path.isAbsolute(o.out)) throw new Error("--out must be an absolute path")
  return o
}

/**
 * The routes. `needs` names an id the route takes, found after login through
 * the app's own API (see DISCOVER). Drawers and modals that open over a list
 * (`/products/create`, `/pages/:key`, `/orders/:id/returns`…) are left out on
 * purpose, except one of each shell kind, since they share their layout.
 */
export const PANEL_ROUTES = [
  { name: "home", path: "/" },
  { name: "home-settings", path: "/home-settings" },
  { name: "analytics", path: "/analytics" },
  { name: "products", path: "/products" },
  { name: "product-detail", path: "/products/:product", needs: "product" },
  { name: "product-variant", path: "/products/:product/variants/:variant", needs: "variant" },
  { name: "product-create", path: "/products/create" },
  { name: "product-attributes", path: "/product-attributes" },
  { name: "product-attribute-detail", path: "/product-attributes/:attribute", needs: "attribute" },
  { name: "categories", path: "/categories" },
  { name: "category-detail", path: "/categories/:category", needs: "category" },
  { name: "orders", path: "/orders" },
  { name: "order-detail", path: "/orders/:order", needs: "order" },
  { name: "order-not-built", path: "/orders/:order/returns", needs: "order" },
  { name: "customers", path: "/customers" },
  { name: "customer-detail", path: "/customers/:customer", needs: "customer" },
  { name: "promotions", path: "/promotions" },
  { name: "promotion-detail", path: "/promotions/:promotion", needs: "promotion" },
  { name: "campaigns", path: "/campaigns" },
  { name: "campaign-detail", path: "/campaigns/:campaign", needs: "campaign" },
  { name: "reviews", path: "/reviews" },
  { name: "pages", path: "/pages" },
  { name: "journal", path: "/journal" },
  { name: "journal-new", path: "/journal/new" },
  { name: "shipping", path: "/shipping" },
  { name: "courses", path: "/courses" },
  { name: "course-detail", path: "/courses/:course", needs: "course" },
  { name: "lesson-new", path: "/courses/:course/lessons/new", needs: "course" },
  { name: "lesson-edit", path: "/courses/:course/lessons/:lesson", needs: "lesson" },
  { name: "marketplace-catalog", path: "/marketplaces/wildberries/products" },
  { name: "marketplace-price-stock", path: "/marketplaces/wildberries/price-stock" },
  { name: "marketplace-orders", path: "/marketplaces/wildberries/orders" },
  { name: "marketplace-reviews", path: "/marketplaces/wildberries/reviews" },
  { name: "marketplace-analytics", path: "/marketplaces/wildberries/analytics" },
  { name: "marketplace-sync", path: "/marketplaces/wildberries/sync" },
  { name: "marketplace-ozon", path: "/marketplaces/ozon" },
  { name: "settings-profile", path: "/settings/profile" },
  { name: "settings-domains", path: "/settings/domains" },
  { name: "settings-sites", path: "/settings/sites" },
  { name: "settings-notifications", path: "/settings/notifications" },
  { name: "settings-customer-login", path: "/settings/customer-login" },
  { name: "settings-locale", path: "/settings/locale" },
  { name: "settings-payments", path: "/settings/payments" },
  { name: "settings-delivery", path: "/settings/delivery" },
  { name: "settings-requisites", path: "/settings/requisites" },
  { name: "settings-redirects", path: "/settings/redirects" },
  { name: "settings-seo", path: "/settings/seo" },
  { name: "settings-analytics", path: "/settings/analytics" },
  { name: "settings-marketplaces", path: "/settings/marketplaces" },
  { name: "settings-integrations", path: "/settings/integrations" },
  { name: "settings-marketplace-wildberries", path: "/settings/marketplaces/wildberries" },
  { name: "settings-marketplace-ozon", path: "/settings/marketplaces/ozon" },
  { name: "settings-integration-wildberries", path: "/settings/integrations/wildberries" },
  { name: "settings-integration-ozon", path: "/settings/integrations/ozon" },
  { name: "settings-integration-robokassa", path: "/settings/integrations/robokassa" },
  { name: "settings-integration-apiship", path: "/settings/integrations/apiship" },
  { name: "settings-integration-pochta", path: "/settings/integrations/pochta" },
  { name: "settings-integration-cdek", path: "/settings/integrations/cdek" },
  { name: "settings-integration-telegram-bot", path: "/settings/integrations/telegram-bot" },
  { name: "settings-staff", path: "/settings/staff" },
  { name: "settings-branding", path: "/settings/branding" },
  { name: "no-match", path: "/this-page-does-not-exist", public: true },
  { name: "login", path: "/login", public: true },
  { name: "forgot-password", path: "/forgot-password", public: true },
  { name: "reset-password", path: "/reset-password?token=x&email=a%40b.c", public: true },
]

/**
 * The panel's own top-level paths the audit does not open, each with why.
 * `src/__tests__/table-scroll.test.mjs` fails a path of `src/app.tsx` that is
 * in neither list, so a new screen cannot slip past the next audit.
 */
export const PANEL_SKIPPED = {
  "/marketplaces/wildberries/products/:id": "a card of a marketplace product; the stand has no Wildberries key, so no id",
  "/marketplaces/wildberries/orders/:id": "a marketplace order; the stand has no Wildberries key, so no id",
  "/settings/wildberries": "an old address, redirects to /settings/marketplaces/wildberries",
  "/settings/ozon": "an old address, redirects to /settings/marketplaces/ozon",
}

export const ADMIN_ROUTES = [
  { name: "admin-tenants", path: "/tenants", ours: true },
  { name: "admin-tenant-detail", path: "/tenants/:tenant", needs: "tenant", ours: true },
  { name: "admin-pricing", path: "/pricing", ours: true },
  { name: "admin-orders", path: "/orders" },
  { name: "admin-order-detail", path: "/orders/:order", needs: "order" },
  { name: "admin-products", path: "/products" },
  { name: "admin-product-detail", path: "/products/:product", needs: "product" },
  { name: "admin-customers", path: "/customers" },
  { name: "admin-customer-detail", path: "/customers/:customer", needs: "customer" },
  { name: "admin-settings-store", path: "/settings/store" },
  { name: "admin-settings-users", path: "/settings/users" },
  { name: "admin-settings-regions", path: "/settings/regions" },
  { name: "admin-login", path: "/login", public: true },
]

/** Ids for the routes that take one: `[api path, pick(json) => value]`, read in the page with its own session. */
const DISCOVER = {
  panel: {
    product: ["/tenants/products?limit=1&fields=id,*variants", (j) => j.products?.[0]?.id],
    variant: ["/tenants/products?limit=1&fields=id,*variants", (j) => {
      const p = j.products?.find((x) => x.variants?.length)
      return p ? { product: p.id, variant: p.variants[0].id } : undefined
    }],
    attribute: ["/tenants/product-attributes", (j) => (j.product_attributes ?? j.attributes)?.[0]?.id],
    category: ["/tenants/product-categories?limit=1", (j) => j.product_categories?.[0]?.id],
    order: ["/tenants/orders?limit=1&fields=id", (j) => j.orders?.[0]?.id],
    customer: ["/tenants/customers?limit=1", (j) => j.customers?.[0]?.id],
    promotion: ["/tenants/promotions?limit=1&fields=id", (j) => j.promotions?.[0]?.id],
    campaign: ["/tenants/campaigns?limit=1&fields=id", (j) => j.campaigns?.[0]?.id],
    course: ["/tenants/courses", (j) => j.courses?.[0]?.id],
    lesson: ["/tenants/courses", null],
  },
  admin: {
    tenant: ["/admin/tenants?limit=1", (j) => j.tenants?.[0]?.id],
    order: ["/admin/orders?limit=1&fields=id", (j) => j.orders?.[0]?.id],
    product: ["/admin/products?limit=1&fields=id", (j) => j.products?.[0]?.id],
    customer: ["/admin/customers?limit=1&fields=id", (j) => j.customers?.[0]?.id],
  },
}

/**
 * Runs in the page. Returns the overflow numbers of the current viewport.
 * Kept free of closures: Playwright serialises it.
 */
export function probeLayout() {
  const vw = window.innerWidth
  const doc = document.documentElement
  const main = document.querySelector("main")
  const shell = new Set()
  for (let el = main; el; el = el.parentElement) shell.add(el)

  const describe = (el) => {
    let s = el.tagName.toLowerCase()
    if (el.id) s += `#${el.id}`
    const testId = el.getAttribute("data-testid")
    if (testId) s += `[data-testid="${testId}"]`
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 6).join(".") : ""
    if (cls) s += `.${cls}`
    return s.slice(0, 160)
  }
  const visible = (el, cs) => {
    if (cs.display === "none" || cs.visibility === "hidden") return false
    // Radix keeps a native radio/checkbox under its control, transparent and
    // shifted left by its own width; nobody sees or reaches it.
    if (cs.opacity === "0") return false
    if (cs.position === "fixed") return false
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return false
    if (cs.clip && cs.clip !== "auto") return false
    return true
  }
  // An element is held when, between it and `main`, an ancestor clips or
  // scrolls on the x axis: it may overflow that box, not the page.
  const held = (el) => {
    for (let p = el.parentElement; p && !shell.has(p); p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX
      if (ox !== "visible") return true
    }
    return false
  }
  const out = []
  const outside = new Set()
  for (const el of document.body.querySelectorAll("*")) {
    const cs = getComputedStyle(el)
    if (!visible(el, cs)) continue
    const r = el.getBoundingClientRect()
    const over = r.right > vw + 1 || r.left < -1
    if (!over) continue
    if (shell.has(el)) continue
    if (held(el)) continue
    outside.add(el)
    if (el.parentElement && outside.has(el.parentElement)) continue
    out.push({
      el: describe(el),
      text: (el.innerText || "").trim().replace(/\s+/g, " ").slice(0, 60),
      left: Math.round(r.left),
      right: Math.round(r.right),
      width: Math.round(r.width),
    })
  }
  out.sort((a, b) => b.width - a.width)

  // The shell's own boxes (`main`, the column around it, the root): wider
  // content either scrolls the whole page sideways or, under overflow-hidden,
  // is cut off. Both count.
  const shellOverflow = [...shell].some(
    (el) => el !== document.body && el !== doc && el.scrollWidth > el.clientWidth + 1
  )

  // Below 1024 px the side menu hides behind an icon button at the top left of
  // the topbar; it must be on screen.
  let menuReachable = null
  if (vw < 1024) {
    menuReachable = [...document.querySelectorAll("button")].some((b) => {
      const cs = getComputedStyle(b)
      const r = b.getBoundingClientRect()
      return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 &&
        Boolean(b.querySelector("svg")) && r.top >= 0 && r.top < 80 && r.left >= 0 && r.right <= vw / 2
    })
  }

  let cells = 0
  const wrappedCells = []
  for (const el of document.querySelectorAll("td, th")) {
    const cs = getComputedStyle(el)
    if (!visible(el, cs)) continue
    cells += 1
    // Lines of text, not the cell's height: a @medusajs/ui cell has a fixed
    // height well above one line, so height alone flags every cell. Each
    // text node's line boxes are counted; two text nodes side by side (an
    // icon and a label) share a line.
    const tops = new Set()
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const rect of range.getClientRects()) {
        if (rect.width < 1) continue
        const top = Math.round(rect.top / 4)
        if (![...tops].some((t) => Math.abs(t - top) <= 2)) tops.add(top)
      }
    }
    if (tops.size > 1) wrappedCells.push((el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40))
  }

  return {
    vw,
    docScrollWidth: doc.scrollWidth,
    docOverflow: doc.scrollWidth > vw,
    shellOverflow,
    offenders: out.slice(0, 8),
    offenderCount: out.length,
    menuReachable,
    cells,
    wrappedCells: wrappedCells.slice(0, 8),
    wrappedCellCount: wrappedCells.length,
    title: document.title,
    url: location.pathname,
  }
}

export function verdict(m) {
  if (m.error) return "error"
  if (m.docOverflow || m.shellOverflow || m.offenderCount > 0) return "overflow"
  if (m.menuReachable === false) return "other"
  return "ok"
}

function loadPlaywright() {
  const dirs = [process.env.MOBILE_AUDIT_PLAYWRIGHT].filter(Boolean)
  for (const d of dirs) {
    try {
      return createRequire(path.join(d, "package.json"))(d)
    } catch {
      /* next */
    }
  }
  for (const base of [path.join(here, "x.js"), path.join(process.cwd(), "x.js")]) {
    try {
      return createRequire(base)("playwright")
    } catch {
      /* next */
    }
  }
  return null
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function settle(page, ms) {
  try {
    await page.waitForLoadState("networkidle", { timeout: 6000 })
  } catch {
    /* a long poll keeps the network busy; the settle below still runs */
  }
  await sleep(ms)
}

async function login(page, base, email, password, kind) {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" })
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30000 })
  await settle(page, 300)
  process.stderr.write(`[mobile-audit] ${kind}: logged in\n`)
}

async function discover(page, origin, table) {
  const ids = {}
  for (const [key, [api, pick]] of Object.entries(table)) {
    try {
      const json = await page.evaluate(async (url) => {
        const r = await fetch(url, { credentials: "include", headers: { accept: "application/json" } })
        return r.ok ? r.json() : null
      }, origin + api)
      if (!json) continue
      if (key === "lesson") {
        const course = json.courses?.[0]
        if (!course) continue
        const detail = await page.evaluate(async (url) => {
          const r = await fetch(url, { credentials: "include" })
          return r.ok ? r.json() : null
        }, `${origin}/tenants/courses/${course.id}`)
        const lesson = detail?.lessons?.[0]
        if (lesson) ids.lesson = { course: course.id, lesson: lesson.id }
        continue
      }
      const v = pick(json)
      if (v) ids[key] = v
    } catch {
      /* the id stays unknown; its routes are skipped */
    }
  }
  return ids
}

function fill(route, ids) {
  if (!route.needs) return route.path
  const v = ids[route.needs]
  if (!v) return null
  const values = typeof v === "object" ? v : { [route.needs]: v }
  if (route.needs === "variant" && typeof v === "object") values.product = v.product
  if (route.needs === "lesson" && typeof v === "object") values.course = v.course
  let p = route.path
  for (const [k, val] of Object.entries(values)) p = p.replace(`:${k}`, val)
  if (p.includes("/:")) return null
  return p
}

async function auditApp(browser, opts, app) {
  const isPanel = app === "panel"
  const base = (isPanel ? opts.panel : opts.admin).replace(/\/$/, "")
  const origin = new URL(base).origin
  const routes = (isPanel ? PANEL_ROUTES : ADMIN_ROUTES).filter(
    (r) => !opts.only || opts.only.some((o) => r.name === o || r.name.includes(o))
  )
  const email = process.env[isPanel ? "MOBILE_AUDIT_OWNER_EMAIL" : "MOBILE_AUDIT_ADMIN_EMAIL"]
  const password = process.env[isPanel ? "MOBILE_AUDIT_OWNER_PASSWORD" : "MOBILE_AUDIT_ADMIN_PASSWORD"]
  const results = []
  const shotsDir = path.join(opts.out, app)
  fs.mkdirSync(shotsDir, { recursive: true })

  for (const theme of opts.themes) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: theme === "dark" ? "dark" : "light" })
    await context.addInitScript((t) => {
      try {
        localStorage.setItem("medusa_admin_theme", t)
      } catch {
        /* storage off */
      }
    }, theme)
    const page = await context.newPage()

    // The public pages first, while the context has no session yet.
    const publicRoutes = routes.filter((r) => r.public)
    const privateRoutes = routes.filter((r) => !r.public)
    let ids = {}
    const order = [...publicRoutes, ...privateRoutes]
    let loggedIn = false

    for (const route of order) {
      if (!route.public && !loggedIn) {
        if (!email || !password) {
          process.stderr.write(`[mobile-audit] ${app}: no login in the environment, private routes skipped\n`)
          break
        }
        await login(page, base, email, password, app)
        ids = await discover(page, origin, DISCOVER[app])
        loggedIn = true
      }
      const filled = fill(route, ids)
      if (!filled) {
        for (const width of opts.widths) results.push({ app, name: route.name, route: route.path, width, theme, skipped: `no ${route.needs} id` })
        continue
      }
      // One load per route at the first width; the other widths resize the
      // same page (the layout answers a resize the way a rotated phone does).
      let loaded = false
      for (const width of opts.widths) {
        const height = width < 768 ? 844 : width < 1024 ? 1024 : 900
        await page.setViewportSize({ width, height })
        const entry = { app, name: route.name, route: filled, width, theme, ours: isPanel || Boolean(route.ours) }
        try {
          if (!loaded) {
            await page.goto(base + filled, { waitUntil: "domcontentloaded", timeout: 45000 })
            await settle(page, opts.settleMs)
            loaded = true
          } else {
            await sleep(400)
          }
          Object.assign(entry, await page.evaluate(probeLayout))
          // A public page (login and the like) has no shell and no side menu.
          if (route.public) entry.menuReachable = null
          if (opts.shotWidths.includes(width)) {
            const file = path.join(shotsDir, `${route.name}-${width}-${theme}.png`)
            await page.screenshot({ path: file })
            entry.shot = file
          }
        } catch (error) {
          entry.error = String(error?.message || error).split("\n")[0].slice(0, 200)
        }
        entry.verdict = verdict(entry)
        results.push(entry)
        process.stderr.write(`[mobile-audit] ${app} ${route.name} ${width} ${theme}: ${entry.verdict}\n`)
      }
    }
    await context.close()
  }
  return results
}

export function summarize(results) {
  const byPage = new Map()
  for (const r of results) {
    const key = `${r.app}|${r.name}|${r.theme}`
    if (!byPage.has(key)) byPage.set(key, { app: r.app, name: r.name, route: r.route, theme: r.theme, widths: {} })
    const row = byPage.get(key)
    row.route = r.route
    row.widths[r.width] = r.skipped ? "skipped" : r.verdict
  }
  return [...byPage.values()]
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const pw = loadPlaywright()
  if (!pw) {
    process.stderr.write("[mobile-audit] playwright not found: set MOBILE_AUDIT_PLAYWRIGHT to its directory\n")
    process.exit(3)
  }
  fs.mkdirSync(opts.out, { recursive: true })
  const browser = await pw.chromium.launch({ headless: true })
  const results = []
  try {
    if (opts.panel) results.push(...(await auditApp(browser, opts, "panel")))
    if (opts.admin) results.push(...(await auditApp(browser, opts, "admin")))
  } finally {
    await browser.close()
  }
  const rows = summarize(results)
  fs.writeFileSync(
    path.join(opts.out, "audit.json"),
    JSON.stringify({ capturedAt: new Date().toISOString(), panel: opts.panel ?? null, admin: opts.admin ?? null, widths: opts.widths, results }, null, 2)
  )
  const widths = opts.widths
  process.stdout.write(`app\tpage\troute\t${widths.join("\t")}\n`)
  for (const row of rows) process.stdout.write(`${row.app}\t${row.name}\t${row.route}\t${widths.map((w) => row.widths[w] ?? "-").join("\t")}\n`)
  const broken = results.filter((r) => r.verdict === "overflow")
  process.stderr.write(`[mobile-audit] ${results.length} measurements, ${broken.length} overflow → ${path.join(opts.out, "audit.json")}\n`)
  if (opts.strict && broken.length) process.exit(1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`[mobile-audit] ${error?.stack || error}\n`)
    process.exit(2)
  })
}
