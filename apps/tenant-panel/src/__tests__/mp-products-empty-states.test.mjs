import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * «Wildberries → Товары» (task-02 of mp-section-design), criterion 6: an
 * empty list says WHY it is empty, and the three reasons read differently
 * (rule 20a):
 *
 *   (а) no key stored          -> «Ключ … не сохранён» + «Сохранить ключ»
 *   (б) key, nothing came yet  -> «Карточки ещё не приходили» + «Обновить сейчас»
 *   (в) a search or a filter   -> `_DataTable`'s own «Нет результатов»
 *
 *   node --test apps/tenant-panel/src/__tests__/
 *
 * Source text and catalogs, like the other tests of this package: there is no
 * React runner here. (а) and (в) are also on the stand screenshots of the task.
 */
const here = dirname(fileURLToPath(import.meta.url))
const src = (...parts) => readFileSync(join(here, "..", ...parts), "utf8")
const catalog = (lang) => JSON.parse(src("i18n", "translations", `${lang}.json`))

const SCREEN = src("routes", "marketplaces", "mp-products", "mp-products.tsx")
const EMPTY = src("routes", "marketplaces", "mp-products", "components", "mp-products-empty.tsx")

for (const lang of ["ru", "en"]) {
  test(`${lang}: the three empty states have their own words`, () => {
    const json = catalog(lang)
    const empty = json.mp.products.empty
    const titles = [empty.noKeyTitle, empty.title, empty.failedTitle, json.general.noResultsTitle]
    for (const title of titles) {
      assert.equal(typeof title, "string")
      assert.ok(title.length > 0)
    }
    assert.equal(new Set(titles).size, titles.length, `titles repeat: ${titles.join(" | ")}`)
    assert.notEqual(empty.noKeyMessage, empty.message)
    assert.ok(empty.saveKey && empty.syncNow)
  })
}

test("en is English and not the Russian copied over", () => {
  const ru = catalog("ru").mp.products
  const en = catalog("en").mp.products
  for (const key of ["title", "empty", "detail"]) {
    assert.notDeepEqual(en[key], ru[key], `mp.products.${key}`)
  }
})

test("the screen shows its own empty state only when nothing was asked for", () => {
  assert.match(SCREEN, /const noQuery = Object\.values\(raw\)\.filter\(Boolean\)\.length === 0/)
  assert.match(SCREEN, /nothingStored = !isLoading && \(count \?\? 0\) === 0 && noQuery/)
  assert.match(SCREEN, /nothingStored \? \(\s*<MpProductsEmpty/)
})

test("the empty state picks its reason from the key and the last run, and acts on it", () => {
  assert.match(EMPTY, /const noKey = sync \? !sync\.key_set : false/)
  assert.match(EMPTY, /const failed = sync\?\.status === "failed"/)
  assert.match(EMPTY, /to=\{`\/settings\/integrations\/\$\{slug\}`\}/)
  assert.match(EMPTY, /useSyncMarketplacesNow\(\)/)
})
