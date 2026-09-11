#!/usr/bin/env node
/**
 * End-to-end acceptance of piece 9 (`t-2026-09-12-mt-storefront-by-host`): ONE
 * storefront process serving every shop, told apart by the Host header.
 *
 *   STOREFRONT_URL=http://localhost:8013 BACKEND_URL=http://localhost:9035 \
 *     node e2e/by-host.e2e.mjs
 *
 * The storefront under test must be started WITHOUT
 * `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`: the whole point is that the key comes
 * from the Host, not from the environment. Chrome and curl resolve `*.localhost`
 * to 127.0.0.1 on their own, so no /etc/hosts entry is needed.
 *
 * What it proves, and how:
 *  - two hosts, one process: each host's catalog equals what the Store API
 *    returns for THAT shop's own publishable key, and the two sets of titles do
 *    not overlap. The counts are read from the API rather than hardcoded,
 *    because the shared stand accumulates fixtures from every other worker.
 *  - the theme is per request: `<html data-theme>`/`data-mode` equal what
 *    `GET /storefront/by-host` answers for that host, and the two differ.
 *  - a shop registered a second ago opens on its own host with no restart.
 *  - a custom domain added through `POST /tenants/domains` serves the same shop.
 *  - an unknown host falls back to single-store mode; with no env key
 *    configured either there is no key at all, and the check reports what the
 *    page actually is rather than assuming.
 *
 * Exit code 0 = every check passed; the log lists each check with PASS/FAIL.
 */
import { createRequire } from "node:module"
import { mkdirSync } from "node:fs"
import path from "node:path"

const require = createRequire(import.meta.url)
const PLAYWRIGHT =
  process.env.PLAYWRIGHT ||
  new URL("../../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright", import.meta.url)
    .pathname
const { chromium } = require(PLAYWRIGHT)

const BACKEND = process.env.BACKEND_URL || "http://localhost:9035"
const PORT = process.env.STOREFRONT_PORT || "8013"
const SHOTS = process.env.SHOTS_DIR || path.resolve("../../artifacts/docs/tenant-panel-shots")
const PASSWORD = "supersecret"

let failures = 0
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`)
  if (!ok) failures++
}

const storefrontUrl = (host, pathname = "/en/store") =>
  `http://${host}:${PORT}${pathname}`

const resolveHost = async (host) => {
  const response = await fetch(
    `${BACKEND}/storefront/by-host?host=${encodeURIComponent(host)}`
  )
  return { status: response.status, body: response.ok ? await response.json() : null }
}

/**
 * A shop's WHOLE catalog, as the Store API answers it for that shop's key. The
 * page shows one page of it in its own order, so membership is the check that
 * holds; a first-page-against-first-page comparison would be a check on the
 * ordering of two different queries, and the shared stand grows products under
 * this run anyway (32 → 34 measured during one e2e pass).
 */
const apiTitles = async (publishableKey) => {
  const response = await fetch(
    `${BACKEND}/store/products?limit=1000&fields=id,title`,
    { headers: { "x-publishable-api-key": publishableKey } }
  )
  const body = await response.json()
  return { count: body.count, titles: (body.products || []).map((p) => p.title) }
}

/** The catalog as the page renders it. */
const pageTitles = (page) =>
  page.$$eval('[data-testid="product-title"]', (nodes) =>
    nodes.map((n) => n.textContent.trim())
  )

const htmlAttrs = (page) =>
  page.$eval("html", (el) => ({
    theme: el.getAttribute("data-theme"),
    mode: el.getAttribute("data-mode"),
  }))

const apiLogin = async (email) => {
  const login = await fetch(`${BACKEND}/auth/tenant/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  const { token } = await login.json()
  return token
}

mkdirSync(SHOTS, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

try {
  // ---- 1. two shops, one process -----------------------------------------
  const shops = {}

  for (const handle of ["acme", "globex"]) {
    const host = `${handle}.localhost`
    const resolved = await resolveHost(host)
    check(`${handle}: the resolver answers for ${host}`, resolved.status === 200, `HTTP ${resolved.status}`)

    if (resolved.status !== 200) {
      continue
    }

    shops[handle] = resolved.body

    await page.goto(storefrontUrl(host), { waitUntil: "networkidle" })
    await page.waitForTimeout(800)

    const titles = await pageTitles(page)
    const attrs = await htmlAttrs(page)
    const api = await apiTitles(resolved.body.publishable_key)
    const strangers = titles.filter((t) => !api.titles.includes(t))

    check(
      `${handle}: every card on the page belongs to this shop`,
      titles.length > 0 && strangers.length === 0,
      `${titles.length} cards on the page, ${api.count} products behind this shop's key` +
        (strangers.length ? `; not this shop's: ${strangers.join(", ")}` : "")
    )
    check(
      `${handle}: <html> carries the theme the resolver named`,
      attrs.theme === resolved.body.theme?.preset &&
        attrs.mode === resolved.body.theme?.mode,
      `page ${attrs.theme}/${attrs.mode}, resolver ${resolved.body.theme?.preset}/${resolved.body.theme?.mode}`
    )

    shops[handle].pageTitles = titles
    shops[handle].pageAttrs = attrs
    shops[handle].apiTitles = api.titles

    await page.screenshot({ path: path.join(SHOTS, `storefront-${handle}.png`) })
    console.log("shot", path.join(SHOTS, `storefront-${handle}.png`))
  }

  if (shops.acme && shops.globex) {
    const overlap = (shops.acme.pageTitles || []).filter((t) =>
      (shops.globex.pageTitles || []).includes(t)
    )
    check(
      "the two shops share no product on their storefronts",
      overlap.length === 0,
      overlap.length ? overlap.join(", ") : "no overlapping title"
    )
    check(
      "the two shops render different themes from the same process",
      shops.acme.pageAttrs?.theme !== shops.globex.pageAttrs?.theme ||
        shops.acme.pageAttrs?.mode !== shops.globex.pageAttrs?.mode,
      `${shops.acme.pageAttrs?.theme}/${shops.acme.pageAttrs?.mode} vs ${shops.globex.pageAttrs?.theme}/${shops.globex.pageAttrs?.mode}`
    )
    const crossed = (shops.acme.pageTitles || []).filter((t) =>
      (shops.globex.apiTitles || []).includes(t)
    )
    check(
      "no card on one shop's storefront exists in the other shop's catalog at all",
      crossed.length === 0,
      crossed.length ? crossed.join(", ") : "checked against the whole catalog behind the other key"
    )
    check(
      "the two shops are served with different publishable keys",
      shops.acme.publishable_key !== shops.globex.publishable_key,
      `${String(shops.acme.publishable_key).slice(0, 12)}… vs ${String(shops.globex.publishable_key).slice(0, 12)}…`
    )
  }

  // ---- 2. a custom domain resolves to the same shop ------------------------
  const acmeToken = await apiLogin("admin@acme.test")
  const customHost = `e2e-${Date.now().toString(36)}.example`
  const added = await fetch(`${BACKEND}/tenants/domains`, {
    method: "POST",
    headers: { authorization: `Bearer ${acmeToken}`, "content-type": "application/json" },
    body: JSON.stringify({ host: customHost }),
  })
  const addedBody = await added.json()
  check(`a custom domain is accepted (${customHost})`, added.status === 201, `HTTP ${added.status}`)

  if (added.status === 201) {
    const resolvedCustom = await resolveHost(customHost)
    check(
      "the custom domain resolves to the same shop as its technical host",
      resolvedCustom.status === 200 &&
        resolvedCustom.body.tenant.handle === "acme",
      `HTTP ${resolvedCustom.status}, handle ${resolvedCustom.body?.tenant?.handle}`
    )

    const removed = await fetch(`${BACKEND}/tenants/domains/${addedBody.domain.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${acmeToken}` },
    })
    check("the fixture domain is removed again", removed.status === 200, `HTTP ${removed.status}`)
  }

  // ---- 3. a shop registered a second ago, with no restart -------------------
  const stamp = Date.now().toString(36).slice(-6)
  const freshHandle = `p9-${stamp}`
  const freshEmail = `admin@${freshHandle}.test`

  const registration = await fetch(`${BACKEND}/auth/tenant/emailpass/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: freshEmail, password: PASSWORD }),
  })
  const { token: registrationToken } = await registration.json()

  const createdTenant = await fetch(`${BACKEND}/tenants`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${registrationToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: `Piece 9 ${stamp}`,
      handle: freshHandle,
      admin: { email: freshEmail, first_name: "Piece9" },
    }),
  })
  check(
    `a new shop is registered through the API (${freshHandle})`,
    createdTenant.status === 201,
    `HTTP ${createdTenant.status}`
  )

  if (createdTenant.status === 201) {
    const freshResponse = await page.goto(storefrontUrl(`${freshHandle}.localhost`), {
      waitUntil: "networkidle",
    })
    await page.waitForTimeout(600)
    const freshTitles = await pageTitles(page)

    check(
      "the new shop's own host serves a page with no restart and no deploy",
      freshResponse.status() === 200,
      `HTTP ${freshResponse.status()}`
    )
    check(
      "the new shop's catalog is empty, not somebody else's",
      freshTitles.length === 0,
      freshTitles.join(", ")
    )
  }

  // ---- 4. an unknown host: single-store fallback ---------------------------
  const unknown = await page.goto(storefrontUrl(`localhost`), {
    waitUntil: "domcontentloaded",
  })
  const unknownStatus = unknown.status()
  const unknownAttrs = await htmlAttrs(page)
  const unknownBody = (await page.locator("body").innerText()).slice(0, 200).replace(/\s+/g, " ")
  const envKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY

  check(
    "an unknown host resolves to no shop",
    (await resolveHost("localhost")).status === 404,
    "GET /storefront/by-host?host=localhost"
  )
  console.log(
    `INFO unknown host localhost:${PORT} → HTTP ${unknownStatus}, data-theme=${unknownAttrs.theme}, data-mode=${unknownAttrs.mode}` +
      `, env key ${envKey ? "set" : "unset"}, body starts: ${unknownBody}`
  )
  if (envKey) {
    check(
      "with an env key configured, the unknown host renders the single store",
      unknownStatus === 200,
      `HTTP ${unknownStatus}`
    )
  } else {
    // No shop on the host AND no fallback key anywhere: the Store API refuses
    // every call, so there is nothing to render. Recorded, not asserted green.
    check(
      "with no env key, the unknown host does not pretend to be a shop",
      unknownStatus !== 200,
      `HTTP ${unknownStatus} (nothing to serve)`
    )
  }
} finally {
  await browser.close()
}

console.log(failures ? `${failures} check(s) failed` : "all checks passed")
process.exit(failures ? 1 : 0)
