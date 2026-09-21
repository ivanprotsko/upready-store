#!/usr/bin/env node
/**
 * Walks every owner screen of the tenant panel the way the owner gets there:
 * the login form first, then each route of `owner-routes.mjs`, at every width
 * asked for. Per screen it saves a full-page screenshot, the `innerText` of the
 * document and a row in `walk-report.json` (final URL, document title, first
 * heading, horizontal overflow, console errors, failed requests).
 *
 *   PANEL_URL=http://localhost:5381 \
 *   OWNER_EMAIL=… OWNER_PASSWORD=… \
 *   SHOT_DIR=artifacts/docs/t-2026-09-21-02/before WIDTHS=1440,390 \
 *     node apps/tenant-panel/e2e/owner-walker.e2e.mjs
 *
 * `ONLY=<regexp>` limits the walk to matching route templates. The password is
 * typed into the form and never printed. Exit code 0 means every route was
 * opened; a route the stand has no data for is listed as `unresolved`, and a
 * route that crashed into the error boundary is listed as `crashed` and fails
 * the run, because a screen the owner cannot open is a finding by itself.
 *
 * Screens are opened by a client-side navigation inside one logged-in page
 * (what a click on a link does), not by reloading the app per route: a reload
 * per route costs a full dev-server module graph each time, and this machine is
 * shared.
 */
import { createRequire } from "node:module"
import { mkdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

import {
  OWNER_ROUTES,
  PUBLIC_ROUTES,
  resolveRoute,
  slugOf,
} from "./owner-routes.mjs"

const require = createRequire(import.meta.url)
const PLAYWRIGHT =
  process.env.PLAYWRIGHT ||
  new URL(
    "../../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright",
    import.meta.url
  ).pathname
const { chromium } = require(PLAYWRIGHT)

const PANEL = (process.env.PANEL_URL || "http://localhost:5180").replace(/\/$/, "")
const EMAIL = process.env.OWNER_EMAIL || "owner-cherkashino@example.test"
const PASSWORD = process.env.OWNER_PASSWORD
const SHOT_DIR = resolve(
  process.env.SHOT_DIR || "artifacts/docs/t-2026-09-21-02/walk"
)
const WIDTHS = (process.env.WIDTHS || "1440,390")
  .split(",")
  .map((w) => Number(w.trim()))
  .filter(Boolean)
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null
const SETTLE_MS = Number(process.env.SETTLE_MS || 900)

if (!PASSWORD) {
  console.error("OWNER_PASSWORD is required (the stand's owner password)")
  process.exit(2)
}

const heightFor = (width) => (width <= 480 ? 844 : 900)

/** Waits until the screen stopped loading: no skeletons, network quiet. */
const settle = async (page) => {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {})
  await page
    .waitForFunction(
      () => document.querySelectorAll('[class*="animate-pulse"]').length === 0,
      null,
      { timeout: 8_000 }
    )
    .catch(() => {})
  await page.waitForTimeout(SETTLE_MS)
}

/** A link click without the link: pushState plus the event the router hears. */
const navigate = async (page, url) => {
  await page.evaluate((to) => {
    window.history.pushState({}, "", to)
    window.dispatchEvent(new PopStateEvent("popstate", { state: {} }))
  }, url)
  await settle(page)
}

const measure = (page) =>
  page.evaluate(() => {
    const root = document.scrollingElement || document.documentElement
    const heading = document.querySelector("h1, h2")
    const dialog = document.querySelector('[role="dialog"]')
    return {
      finalUrl: location.pathname + location.search,
      title: document.title,
      heading: heading ? heading.textContent.trim().slice(0, 120) : null,
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      hasDialog: Boolean(dialog),
      text: document.body.innerText,
    }
  })

/** The error boundary and the router's own crash screen both say so in text. */
const looksCrashed = (text) =>
  /Unexpected Application Error|An error occurred|Произошла ошибка|Something went wrong/i.test(
    text
  )

const walkWidth = async (browser, width) => {
  const dir = join(SHOT_DIR, String(width))
  mkdirSync(dir, { recursive: true })

  const context = await browser.newContext({
    viewport: { width, height: heightFor(width) },
    deviceScaleFactor: width <= 480 ? 2 : 1,
    isMobile: width <= 480,
    hasTouch: width <= 480,
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
  })
  const page = await context.newPage()

  let consoleErrors = []
  let failedRequests = []
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text().slice(0, 300))
    }
  })
  page.on("response", (response) => {
    if (response.status() >= 400) {
      const url = new URL(response.url())
      failedRequests.push(`${response.status()} ${response.request().method()} ${url.pathname}`)
    }
  })

  const rows = []
  const record = async (route, url) => {
    const slug = slugOf(route.path)
    const m = await measure(page)
    // The shell scrolls an inner container, not the document, so a "full page"
    // screenshot stops at the fold. Grow the viewport by what that container
    // hides, shoot, and put the viewport back. The overflow figures above were
    // taken at the real viewport, before this.
    const hidden = await page.evaluate(() => {
      let most = 0
      for (const el of document.querySelectorAll("*")) {
        const oy = getComputedStyle(el).overflowY
        if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) {
          most = Math.max(most, el.scrollHeight - el.clientHeight)
        }
      }
      return most
    })
    const base = heightFor(width)
    if (hidden > 0) {
      await page.setViewportSize({ width, height: Math.min(base + hidden, 12_000) })
      await page.waitForTimeout(200)
    }
    await page.screenshot({ path: join(dir, `${slug}.png`), fullPage: true })
    if (hidden > 0) {
      await page.setViewportSize({ width, height: base })
    }
    writeFileSync(join(dir, `${slug}.txt`), m.text)
    const row = {
      route: route.path,
      url,
      kind: route.kind ?? "page",
      core: Boolean(route.core),
      finalUrl: m.finalUrl,
      title: m.title,
      heading: m.heading,
      hasDialog: m.hasDialog,
      scrollWidth: m.scrollWidth,
      overflowX: m.scrollWidth > width,
      crashed: looksCrashed(m.text),
      consoleErrors,
      failedRequests,
      screenshot: join(dir, `${slug}.png`),
      innerText: join(dir, `${slug}.txt`),
    }
    rows.push(row)
    console.log(
      `${width}  ${row.crashed ? "CRASH" : row.overflowX ? "OVERF" : "ok   "}  ${url}` +
        (row.finalUrl !== url ? `  → ${row.finalUrl}` : "") +
        (failedRequests.length ? `  [${failedRequests.length} failed requests]` : "")
    )
    consoleErrors = []
    failedRequests = []
  }

  // 1. The screens in front of the session, and the login itself.
  for (const route of PUBLIC_ROUTES) {
    if (ONLY && !ONLY.test(route.path)) {
      continue
    }
    await page.goto(`${PANEL}${route.path}`, { waitUntil: "domcontentloaded" })
    await settle(page)
    await record(route, route.path)
  }

  await page.goto(`${PANEL}/login`, { waitUntil: "domcontentloaded" })
  await settle(page)
  await page.locator('input[name="email"]').fill(EMAIL)
  await page.locator('input[name="password"]').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForFunction(() => !location.pathname.endsWith("/login"), null, {
    timeout: 30_000,
  })
  await settle(page)

  // 2. Every owner route, params filled from the stand through the session.
  const api = (path) =>
    page.evaluate(async (p) => {
      const response = await fetch(p, { credentials: "include" })
      if (!response.ok) {
        throw new Error(`${response.status} on ${p.split("?")[0]}`)
      }
      return response.json()
    }, path)

  const got = {}
  const unresolved = []
  for (const route of OWNER_ROUTES) {
    if (ONLY && !ONLY.test(route.path)) {
      continue
    }
    const resolved = await resolveRoute(route.path, api, got)
    if (resolved.unresolved) {
      unresolved.push({ route: route.path, reason: resolved.unresolved })
      console.log(`${width}  UNRES  ${route.path}  — ${resolved.unresolved}`)
      continue
    }
    await navigate(page, resolved.url)
    await record(route, resolved.url)
    // An overlay route leaves a drawer or a modal open; close it by going to
    // its parent, so the next screen is not shot underneath it.
    if (route.kind === "overlay") {
      await page.keyboard.press("Escape").catch(() => {})
      await page.waitForTimeout(250)
    }
  }

  await context.close()
  return { width, rows, unresolved }
}

const main = async () => {
  mkdirSync(SHOT_DIR, { recursive: true })
  const browser = await chromium.launch()
  const results = []
  try {
    for (const width of WIDTHS) {
      results.push(await walkWidth(browser, width))
    }
  } finally {
    await browser.close()
  }

  const report = {
    panel: PANEL,
    walkedAt: new Date().toISOString(),
    widths: WIDTHS,
    results,
  }
  const reportPath = join(SHOT_DIR, "walk-report.json")
  writeFileSync(reportPath, JSON.stringify(report, null, 2))

  let crashed = 0
  for (const { width, rows, unresolved } of results) {
    const overflow = rows.filter((r) => r.overflowX)
    const broken = rows.filter((r) => r.crashed)
    crashed += broken.length
    console.log(
      `\n== ${width}px: ${rows.length} screens, ${overflow.length} with horizontal overflow, ` +
        `${broken.length} crashed, ${unresolved.length} unresolved`
    )
    for (const r of overflow) {
      console.log(`   overflow  ${r.url}  scrollWidth=${r.scrollWidth}`)
    }
    for (const r of broken) {
      console.log(`   crashed   ${r.url}`)
    }
    for (const u of unresolved) {
      console.log(`   unresolved ${u.route}  — ${u.reason}`)
    }
  }
  console.log(`\nreport: ${reportPath}`)
  process.exit(crashed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
