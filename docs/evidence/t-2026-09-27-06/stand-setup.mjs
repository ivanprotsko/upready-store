#!/usr/bin/env node
/**
 * t-2026-09-27-06: a test shop on the LOCAL stand for the panel half of the check, so the
 * panel is looked at through an owner nobody real is, and no real owner's e-mail can
 * reach a screenshot.
 *
 *   BACKEND=http://localhost:9611 CREDENTIALS=<file outside git> node stand-setup.mjs
 *
 * Registers a tenant with a made-up e-mail and a random password through the same routes
 * a new owner uses (`/auth/tenant/emailpass/register`, `POST /tenants`), then gives it the
 * rows the W22 report's two named screens need to show a second line: a select
 * characteristic «Страна производства» with the options on Ivan's screenshot (Россия,
 * Китай, Таиланд, Индия) for `/product-attributes`, and one manual redirect for
 * `/settings/redirects`. `/pages` needs nothing: its rows are the shop's own sections.
 * The e-mail and password go to CREDENTIALS only; stdout carries the handle and statuses.
 * Refuses any backend that is not on localhost.
 */
import crypto from "node:crypto"
import fs from "node:fs"

const BACKEND = (process.env.BACKEND ?? "http://localhost:9611").replace(/\/$/, "")
const CREDENTIALS = process.env.CREDENTIALS
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BACKEND)) throw new Error("BACKEND must be a localhost stand")
if (!CREDENTIALS) throw new Error("CREDENTIALS (a file outside git) is required")

// A second run reuses the shop the first one registered (its CREDENTIALS file).
const saved = fs.existsSync(CREDENTIALS) ? JSON.parse(fs.readFileSync(CREDENTIALS, "utf8")) : null
const handle = saved?.handle ?? `w22-check-${Date.now().toString(36)}`
const email = saved?.email ?? `${handle}@example.test`
const password = saved?.password ?? crypto.randomBytes(18).toString("base64url")

const call = async (method, path, body, token) => {
  const response = await fetch(BACKEND + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await response.json().catch(() => ({}))
  console.log(`${method} ${path} → ${response.status}`)
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(data).slice(0, 200)}`)
  return data
}

if (!saved) {
  const { token: registration } = await call("POST", "/auth/tenant/emailpass/register", { email, password })
  await call("POST", "/tenants", { name: `Проверка W22 ${handle.slice(-8)}`, handle, admin: { email, first_name: "Тест", last_name: "Владелец" } }, registration)
  fs.writeFileSync(CREDENTIALS, JSON.stringify({ handle, email, password }) + "\n", { mode: 0o600 })
}
const { token } = await call("POST", "/auth/tenant/emailpass", { email, password })

await call(
  "POST",
  "/tenants/product-attributes",
  {
    key: "strana_proizvodstva",
    name: "Страна производства",
    type: "select",
    options: [
      { value: "rossiya", label: "Россия" },
      { value: "kitay", label: "Китай" },
      { value: "tailand", label: "Таиланд" },
      { value: "indiya", label: "Индия" },
    ],
  },
  token
)
await call("POST", "/tenants/redirects", { from_path: "/old-catalog/vitamins", to_path: "/categories/vitamins" }, token)

console.log(`test shop ${handle} ready`)
