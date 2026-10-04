import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * «Wildberries → Цены и остатки» (task-03 of mp-section-design), the panel
 * half of the acceptance:
 *
 *   5. the screen's directory holds no `<Input`, no `useMutation` and no
 *      «отправить» (the backend proof is `price-stock-read-only.unit.spec.ts`);
 *   the three empty states read differently, «Где есть» is labelled by the
 *   marketplace and not by a hard-coded «Wildberries», the file is the live
 *   export and not a toast, and the drawer opens from the row's menu.
 *
 *   node --test apps/tenant-panel/src/__tests__/
 *
 * Source text and catalogs, like the other tests of this package: there is no
 * React runner here.
 */
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")
const src = (...parts) => readFileSync(join(root, ...parts), "utf8")
const catalog = (lang) => JSON.parse(src("i18n", "translations", `${lang}.json`))

const DIR = join(root, "routes", "marketplaces", "mp-price-stock")
const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : /\.tsx?$/.test(entry) ? [full] : []
  })
const withoutComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")

const FILES = walk(DIR)
const SCREEN = src("routes", "marketplaces", "mp-price-stock", "mp-price-stock.tsx")
const EMPTY = src("routes", "marketplaces", "mp-price-stock", "components", "mp-price-stock-empty.tsx")
const DRAWER = src("routes", "marketplaces", "mp-price-stock", "components", "mp-lines-drawer.tsx")

test("the screen's directory has the screen, the drawer and the empty state", () => {
  const names = FILES.map((file) => file.slice(DIR.length + 1)).sort()
  for (const name of ["mp-price-stock.tsx", "components/mp-lines-drawer.tsx", "components/mp-price-stock-empty.tsx"]) {
    assert.ok(names.includes(name), `${name} is missing: ${names.join(", ")}`)
  }
})

for (const file of FILES) {
  test(`${file.slice(DIR.length + 1)}: read only, no input, no mutation, no «отправить»`, () => {
    const source = withoutComments(readFileSync(file, "utf8"))
    assert.doesNotMatch(source, /<Input\b|<input\b|<Textarea\b|contentEditable/)
    assert.doesNotMatch(source, /useMutation/)
    assert.doesNotMatch(source, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/)
    assert.doesNotMatch(source.toLowerCase(), /отправить/)
  })
}

for (const lang of ["ru", "en"]) {
  test(`${lang}: the three empty states have their own words`, () => {
    const json = catalog(lang)
    const empty = json.mp.priceStock.empty
    const titles = [empty.nothing.title, empty.no_prices.title, empty.no_links.title, json.general.noResultsTitle]
    for (const title of titles) {
      assert.equal(typeof title, "string")
      assert.ok(title.length > 0)
    }
    assert.equal(new Set(titles).size, titles.length, `titles repeat: ${titles.join(" | ")}`)
    assert.ok(empty.openProducts && empty.openSync)
    assert.ok(json.marketplaceSync.syncNow.button)
  })
}

test("ru: the empty states say what the brief asked for", () => {
  const empty = catalog("ru").mp.priceStock.empty
  assert.equal(empty.no_prices.title, "Цены ещё не приходили")
  assert.match(empty.no_links.message, /Свяжите карточки с товарами в «Товары»/)
})

test("en is English and not the Russian copied over", () => {
  const ru = catalog("ru").mp.priceStock
  const en = catalog("en").mp.priceStock
  for (const key of ["title", "columns", "state", "filters", "empty", "lines", "toasts"]) {
    assert.notDeepEqual(en[key], ru[key], `mp.priceStock.${key}`)
  }
})

test("«Где есть» is labelled by the marketplace the screen shows", () => {
  assert.doesNotMatch(SCREEN, /marketplace:\s*"Wildberries"/)
  assert.match(SCREEN, /const useFilters = \(marketplace: MarketplaceId\)/)
  assert.match(SCREEN, /t\(`mp\.priceStock\.state\.\$\{state\}`, \{ marketplace: label \}\)/)
})

test("the file is the live export of the same query, not a toast", () => {
  assert.match(SCREEN, /mpPriceStockExportPath\(marketplace, query\)/)
  assert.match(SCREEN, /sdk\.client\.fetch<Response>\(exportPath, \{\s*headers: \{ accept: "text\/csv" \}/)
})

test("the drawer opens from the row's menu, and only for a row with marketplace lines", () => {
  assert.match(SCREEN, /label: t\("mp\.priceStock\.actions\.lines"\),\s*onClick: \(\) => openLines\(row\.original\)/)
  assert.match(SCREEN, /row\.original\.mp && row\.original\.external_id/)
  assert.match(SCREEN, /<MpLinesDrawer marketplace=\{marketplace\} row=\{linesOf\}/)
})

test("the empty state picks its reason from what is stored, and the filter row stays for «no links»", () => {
  assert.match(EMPTY, /stored\.cards === 0 && stored\.variants === 0/)
  assert.match(EMPTY, /stored\.cards > 0 && stored\.lines === 0/)
  assert.match(EMPTY, /count === 0 && counts\.both === 0 && needsLinks/)
  assert.match(SCREEN, /reason === "no_links" \? \([\s\S]*<DataTableQuery/)
  assert.match(EMPTY, /useMpSyncNow\(marketplace\)/)
})

test("«Устарело» keeps the measured time in its tooltip", () => {
  assert.match(SCREEN, /t\("mp\.priceStock\.staleHint", \{ date: getFullDate\(\{ date, includeTime: true \}\) \}\)/)
})

test("the drawer keeps pagination on: `DataTableRoot` throws without its state", () => {
  assert.match(DRAWER, /enablePagination: true/)
  assert.doesNotMatch(DRAWER, /enablePagination: false/)
  assert.match(DRAWER, /prefix: "lines"/)
})
