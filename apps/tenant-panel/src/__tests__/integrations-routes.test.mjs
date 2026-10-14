import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * t-2026-10-14-58: the «Telegram» row of «Настройки → Подключение» linked to
 * `/settings/integrations/telegram-bot`, the screen existed, but `app.tsx` had
 * no route for it, so the click landed on 404. Every link the hub renders
 * must have a declared route, and the route must load a screen that exists.
 */

const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, "..")
const read = (path) => readFileSync(join(src, path), "utf8")

const APP = read("app.tsx")
const HUB = read("routes/settings/integrations/integrations.tsx")

const hubLinks = [...HUB.matchAll(/to:\s*"(\/settings\/integrations\/[a-z0-9-]+)"/g)].map((m) => m[1])

test("the hub links to the Telegram bot screen", () => {
  assert.ok(hubLinks.includes("/settings/integrations/telegram-bot"))
})

test("every hub link has a route in app.tsx", () => {
  assert.ok(hubLinks.length > 0, "the hub renders integration links")
  for (const path of new Set(hubLinks)) {
    assert.match(APP, new RegExp(`path:\\s*"${path}"`), `${path} is declared in app.tsx`)
  }
})

test("the Telegram bot route loads its screen with a breadcrumb and an error boundary", () => {
  const at = APP.indexOf('path: "/settings/integrations/telegram-bot"')
  assert.ok(at >= 0, "telegram-bot route is declared")
  // The route object ends at its own closing line; `handle: { … },` closes earlier.
  const route = APP.slice(at, APP.indexOf("\n          }", at))
  assert.match(route, /breadcrumb: \(\) => t\("integrations\.telegramBot\.title"\)/)
  assert.match(route, /errorElement: <ErrorBoundary \/>/)
  assert.match(route, /lazy: \(\) => import\("\.\/routes\/settings\/integrations\/telegram-bot"\)/)
  assert.ok(existsSync(join(src, "routes/settings/integrations/telegram-bot/index.ts")))
  assert.match(read("routes/settings/integrations/telegram-bot/index.ts"), /as Component/)
})
