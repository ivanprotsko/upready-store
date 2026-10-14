import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * t-2026-09-24-n12: «Настройки → Сайты». Source-text checks, for the reason
 * `shop-switcher.test.mjs` gives: this package runs `node --test`, with no
 * DOM renderer.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const read = (relativePath) => readFileSync(join(SRC, relativePath), "utf8")

const screen = read("routes/settings/sites/sites.tsx")
// t-2026-10-14-01 (panel redesign, G2): «Создать сайт» moved into its modal.
const create = read("routes/settings/sites/site-create/site-create.tsx")
const hook = read("hooks/api/sites.tsx")
const nav = read("components/layout/owner-nav/nav-model.ts")
const app = read("app.tsx")
const ru = JSON.parse(read("i18n/translations/ru.json"))
const en = JSON.parse(read("i18n/translations/en.json"))

test("the section is «Сайты» in the settings menu and a registered route", () => {
  assert.match(nav, /labelKey: "app\.nav\.owner\.sites", to: "\/settings\/sites"/)
  assert.match(app, /path: "\/settings\/sites"/)
  assert.equal(ru.app.nav.owner.sites, "Сайты")
})

test("reads GET /tenants/sites and creates through POST /tenants/sites", () => {
  assert.match(hook, /sdk\.client\.fetch<\{ sites: TenantSite\[\] \}>\("\/tenants\/sites"\)/)
  assert.match(hook, /"\/tenants\/sites", \{\s*method: "POST"/)
})

test("a new site refreshes the header's shop switcher too", () => {
  assert.match(hook, /queryKey: \["tenant-shops"\]/)
})

test("another site opens through the existing switcher, not a second one", () => {
  assert.match(screen, /useSwitchShop/)
  assert.doesNotMatch(screen, /\/tenants\/switch\//)
})

test("the form sends name, handle and the two copy flags, and nothing naming a source", () => {
  assert.match(create, /copy_pages: zod\.boolean\(\)/)
  assert.match(create, /copy_shipping: zod\.boolean\(\)/)
  assert.match(create, /defaultValues: \{ name: "", handle: "", copy_pages: true, copy_shipping: true \}/)
  assert.match(create, /await createSite\(values\)/)
  assert.doesNotMatch(create, /source_tenant_id/)
  assert.doesNotMatch(screen, /source_tenant_id/)
})

test("Russian copy never says «группа», and en/ru carry the same keys", () => {
  const flat = (value, prefix = "") =>
    typeof value === "object"
      ? Object.entries(value).flatMap(([key, inner]) => flat(inner, `${prefix}${key}.`))
      : [[prefix.slice(0, -1), value]]
  for (const [, text] of flat(ru.sites)) {
    assert.doesNotMatch(text, /групп/i)
  }
  assert.deepEqual(
    flat(en.sites).map(([key]) => key).sort(),
    flat(ru.sites).map(([key]) => key).sort()
  )
})
