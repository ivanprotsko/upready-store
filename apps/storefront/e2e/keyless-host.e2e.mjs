#!/usr/bin/env node
/**
 * Regression check for t01-checkout-thankyou: a request the storefront cannot
 * tie to a shop must DEGRADE, never answer 500.
 *
 *   STOREFRONT_PORT=8041 BACKEND_URL=http://localhost:9031 \
 *     TENANT_HOST=supershop.localhost ORDER_ID=order_… \
 *     node e2e/keyless-host.e2e.mjs
 *
 * The defect it holds down, measured 2026-09-15 on the local MT stand: one
 * storefront process serves every shop and takes the publishable key from the
 * Host (`docs/multitenancy/storefront-by-host.md`). A request whose Host names
 * no tenant carries no key, so every `/store/*` route answers
 * `400 Publishable API key required` — and four site-wide reads rethrew that
 * 400 (`listCategories`, `listTopCategoriesWithCounts`, `listCollections`,
 * `listRegions`; the first only ever expected a 404), which turned EVERY route
 * under `(main)` into `Application error: a client-side exception has occurred`.
 * On `/{locale}/order/{id}/confirmed` that is a buyer seeing a stack trace at
 * the moment their card was charged, with the order already placed.
 *
 * The keyless host is the shape a request arrives in when the middleware could
 * not resolve the shop: an internal container address, a health probe, a host
 * whose tenant was archived. The storefront under test must run WITHOUT
 * `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`, exactly as the multi-tenant deployment
 * does — with a single-store fallback key configured there is no keyless
 * request to make and this file proves nothing.
 *
 * `Host` is set through `node:http` on purpose: `fetch` (undici) silently drops
 * a `host` header, so a fetch-based version of this file would send every
 * request to `127.0.0.1` and pass while testing nothing.
 *
 * Exit code 0 = every check passed; the log lists each check with PASS/FAIL.
 */
import http from "node:http"

const PORT = Number(process.env.STOREFRONT_PORT || "8041")
const BACKEND = process.env.BACKEND_URL || "http://localhost:9031"
const TENANT_HOST = process.env.TENANT_HOST || "supershop.localhost"
/** Names no tenant on purpose: the address one container reaches another by. */
const KEYLESS_HOST = process.env.KEYLESS_HOST || "mt-storefront:8000"
const LOCALE = process.env.LOCALE || "ru"
/** A real, placed order. Optional: without it the confirmation body is not checked. */
const ORDER_ID = process.env.ORDER_ID || ""

let failures = 0
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`)
  if (!ok) failures++
}

/** The routes that render the site-wide chrome the defect lived in. */
const ROUTES = [
  `/${LOCALE}`,
  `/${LOCALE}/store`,
  `/${LOCALE}/cart`,
  `/${LOCALE}/account`,
  `/${LOCALE}/order/order_01ORDERTHATDOESNOTEXIST/confirmed`,
]

const get = (host, pathname) =>
  new Promise((resolve, reject) => {
    const request = http.request(
      { host: "127.0.0.1", port: PORT, path: pathname, method: "GET", headers: { host } },
      (response) => {
        let body = ""
        response.setEncoding("utf8")
        response.on("data", (chunk) => (body += chunk))
        response.on("end", () => resolve({ status: response.statusCode, body }))
      }
    )
    request.on("error", reject)
    request.end()
  })

const resolvesToTenant = async (host) => {
  const response = await fetch(
    `${BACKEND}/storefront/by-host?host=${encodeURIComponent(host)}`
  )
  if (!response.ok) return null
  const body = await response.json()
  return body?.publishable_key ?? null
}

// The two hosts have to BE what the checks below assume, or a green run proves
// nothing: a KEYLESS_HOST that quietly resolves to a shop would pass every
// assertion while testing the opposite of this file's subject.
const tenantKey = await resolvesToTenant(TENANT_HOST)
check(
  `GET /storefront/by-host names a shop for "${TENANT_HOST}"`,
  Boolean(tenantKey),
  tenantKey ? `publishable key ${tenantKey.slice(0, 10)}…` : "no tenant behind this host"
)

const keylessKey = await resolvesToTenant(KEYLESS_HOST)
check(
  `GET /storefront/by-host names NO shop for "${KEYLESS_HOST}"`,
  keylessKey === null,
  keylessKey ? "this host resolves to a tenant, pick another one" : "404, as the check needs"
)

for (const pathname of ROUTES) {
  const { status, body } = await get(KEYLESS_HOST, pathname)
  check(
    `keyless host: ${pathname} degrades instead of crashing`,
    status !== 500 && !body.includes("Application error"),
    `HTTP ${status}`
  )
}

for (const pathname of ROUTES) {
  const { status } = await get(TENANT_HOST, pathname)
  check(`tenant host: ${pathname} still renders`, status === 200, `HTTP ${status}`)
}

if (ORDER_ID) {
  const { status, body } = await get(
    TENANT_HOST,
    `/${LOCALE}/order/${ORDER_ID}/confirmed`
  )
  // The order data itself, not merely a page that did not crash: the whole
  // point of the defect is that a paying customer must see their order.
  check(
    `tenant host: /${LOCALE}/order/${ORDER_ID}/confirmed shows the order`,
    status === 200 && body.includes('data-testid="order-complete-container"'),
    `HTTP ${status}`
  )
} else {
  console.log("SKIP order body check — set ORDER_ID to a placed order to run it")
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
