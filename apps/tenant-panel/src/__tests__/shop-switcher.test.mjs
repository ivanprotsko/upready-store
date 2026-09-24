import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * o25-platform-admin-all-shops (t-2026-09-24-n5): the header's shop switcher,
 * shown only when `GET /tenants/me/shops` returns more than one shop.
 *
 * WHY SOURCE TEXT AND NOT A RENDER. Same reason `profile-password.test.mjs`
 * gives: this package ships `node --test` (package.json `"test"`), not
 * vitest — there is no jsdom/React Testing Library dependency and no config
 * for one anywhere in `apps/tenant-panel`. Adding that runner is a separate
 * infrastructure decision, not something a one-task PR should introduce by
 * itself, so this follows the convention the existing tests already use.
 *
 *   node --test apps/tenant-panel/src/__tests__/
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")

const read = (relativePath) => readFileSync(join(SRC, relativePath), "utf8")

const mainLayout = read("components/layout/main-layout/main-layout.tsx")
const shopsHook = read("hooks/api/shops.tsx")

test("ShopSwitcher hides itself with one shop or fewer", () => {
  const start = mainLayout.indexOf("const ShopSwitcher = ()")
  assert.ok(start >= 0, "ShopSwitcher component not found in main-layout.tsx")
  const body = mainLayout.slice(start, start + 1200)

  assert.ok(
    body.includes("shops.length <= 1") && body.includes("return null"),
    "ShopSwitcher must return null when the caller has one shop or fewer"
  )
})

test("ShopSwitcher lists every shop GET /tenants/me/shops returns, by name", () => {
  const start = mainLayout.indexOf("const ShopSwitcher = ()")
  const body = mainLayout.slice(start, start + 2000)

  assert.ok(body.includes("useMyShops"), "ShopSwitcher must read useMyShops()")
  assert.ok(
    body.includes("shops.map((shop)"),
    "ShopSwitcher must render one entry per shop"
  )
  assert.ok(body.includes("{shop.name}"), "each entry must show the shop's name")
})

test("ShopSwitcher calls the switch mutation with the chosen shop's id, and reloads on success", () => {
  const start = mainLayout.indexOf("const ShopSwitcher = ()")
  const body = mainLayout.slice(start, start + 2000)

  assert.ok(body.includes("useSwitchShop"), "ShopSwitcher must use useSwitchShop()")
  assert.ok(
    body.includes("switchShop({ tenant_id: shop.id })"),
    "picking a shop must call switchShop with that shop's tenant id"
  )
  assert.ok(
    body.includes('window.location.assign("/")'),
    "a successful switch must reload to the overview, not just invalidate the cache " +
      "(every screen's cached query data belongs to the shop it was fetched under)"
  )
})

test("useMyShops reads GET /tenants/me/shops", () => {
  assert.ok(
    shopsHook.includes('"/tenants/me/shops"'),
    "useMyShops must call GET /tenants/me/shops"
  )
})

test("useSwitchShop posts to /tenants/me/switch and turns the token into this session's cookie", () => {
  assert.ok(
    shopsHook.includes('"/tenants/me/switch"') && shopsHook.includes('method: "POST"'),
    "useSwitchShop must POST /tenants/me/switch"
  )
  assert.ok(
    shopsHook.includes('"/auth/session"') &&
      shopsHook.includes("Authorization: `Bearer ${token}`"),
    "useSwitchShop must convert the returned token into a session cookie via POST " +
      "/auth/session, the same way sdk.auth.login does for session-based auth"
  )
})
