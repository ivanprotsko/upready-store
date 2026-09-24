import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * t-2026-09-24-n12: the product card's «Сайты» section. Source-text checks,
 * for the reason `shop-switcher.test.mjs` gives: this package runs
 * `node --test`, with no DOM renderer.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const read = (relativePath) => readFileSync(join(SRC, relativePath), "utf8")

const section = read(
  "routes/products/product-detail/components/product-sites-section/product-sites-section.tsx"
)
const detail = read("routes/products/product-detail/product-detail.tsx")
const hook = read("hooks/api/site-scope.tsx")
const ru = JSON.parse(read("i18n/translations/ru.json"))
const en = JSON.parse(read("i18n/translations/en.json"))

test("the section renders nothing for a shop with one site", () => {
  assert.match(section, /if \(product\.site_scope === undefined\) \{\s*return null/)
})

test("a product another site owns is read-only", () => {
  assert.match(section, /const readOnly = product\.owned === false/)
  assert.match(section, /readOnly \? \(/)
})

test("only the sites of the owner's own client are offered", () => {
  assert.match(section, /filter\(\(shop\) => shop\.same_group\)/)
})

test("saves site_scope through POST /tenants/products/:id", () => {
  assert.match(hook, /`\/tenants\/products\/\$\{id\}`/)
  assert.match(section, /mode === "all" \? "all" : \{ tenant_ids: selected \}/)
})

test("the product card mounts the section", () => {
  assert.match(detail, /<ProductSitesSection product=\{product\} \/>/)
})

test("Russian copy: «Сайты», «на всех моих сайтах», never the word group", () => {
  assert.equal(ru.products.sites.header, "Сайты")
  assert.equal(ru.products.sites.all, "На всех моих сайтах")
  for (const value of Object.values(ru.products.sites)) {
    assert.doesNotMatch(value, /групп/i)
  }
  assert.deepEqual(Object.keys(en.products.sites).sort(), Object.keys(ru.products.sites).sort())
})
