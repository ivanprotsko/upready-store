import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { OWNER_ROUTES, PARAM_RESOLVERS } from "../../e2e/owner-routes.mjs"
import {
  ALL_CATALOG,
  STARTER_OPTION_VALUE,
  attributeBody,
  attributeListPage,
  cleanTranslations,
  optionsProblem,
} from "../routes/product-attributes/attribute-model.ts"

/**
 * t-2026-10-14-01 (panel redesign, stage 3, G2 «Список и карточка»):
 * `/product-attributes` and its card rebuilt after the prototype. The list is
 * `_DataTable`, the create is a `RouteFocusModal`, the card reads and each of
 * its three sections edits in its own `SettingsEditDrawer`. This package
 * cannot render JSX (see `settings-detail-edit-drawer.test.mjs`), so the
 * screens are asserted on their source; the save body, the value checks and
 * the list's search run for real.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const read = (path) => readFileSync(join(SRC, path), "utf8")

const app = read("app.tsx")
const ru = JSON.parse(read("i18n/translations/ru.json"))
const en = JSON.parse(read("i18n/translations/en.json"))
const lookup = (catalog, key) =>
  key.split(".").reduce((node, part) => (node == null ? node : node[part]), catalog)

const DIR = "routes/product-attributes"
const FILES = [
  `${DIR}/attribute-list/attribute-list.tsx`,
  `${DIR}/attribute-create/attribute-create.tsx`,
  `${DIR}/attribute-detail/attribute-detail.tsx`,
  `${DIR}/attribute-detail/breadcrumb.tsx`,
  `${DIR}/attribute-edit/attribute-edit.tsx`,
  `${DIR}/attribute-translations-edit/attribute-translations-edit.tsx`,
  `${DIR}/attribute-values-edit/attribute-values-edit.tsx`,
  `${DIR}/use-attribute-save.ts`,
  `${DIR}/use-attribute-delete.ts`,
]
const list = read(`${DIR}/attribute-list/attribute-list.tsx`)
const create = read(`${DIR}/attribute-create/attribute-create.tsx`)
const card = read(`${DIR}/attribute-detail/attribute-detail.tsx`)
const general = read(`${DIR}/attribute-edit/attribute-edit.tsx`)
const values = read(`${DIR}/attribute-values-edit/attribute-values-edit.tsx`)

const saved = {
  id: "pa_1",
  key: "country",
  name: "Страна производства",
  type: "select",
  unit: null,
  position: 5,
  category_id: null,
  show_on_product: true,
  use_as_filter: true,
  translations: { en: "Country of origin", de: " " },
  options: [
    { id: "o2", value: "belarus", label: "Беларусь", position: 1, translations: { en: "Belarus" } },
    { id: "o1", value: "rossiya", label: "Россия", position: 0, translations: { en: "Russia" } },
  ],
}

// ── the router and the walker ───────────────────────────────────────────────

test("the list, the create modal, the card and its three drawers are routes; the crumb is a key", () => {
  for (const [path, module] of [
    ["create", "./routes/product-attributes/attribute-create"],
    [":id", "./routes/product-attributes/attribute-detail"],
    ["edit", "./routes/product-attributes/attribute-edit"],
    ["translations/edit", "./routes/product-attributes/attribute-translations-edit"],
    ["values/edit", "./routes/product-attributes/attribute-values-edit"],
  ]) {
    assert.ok(app.includes(`path: "${path}",`), `app.tsx registers ${path}`)
    assert.ok(app.includes(`"${module}"`), `app.tsx lazy-loads ${module}`)
  }
  assert.ok(app.includes('handle: { breadcrumb: () => t("productAttributes.title") }'))
  assert.ok(!app.includes('breadcrumb: () => "Характеристики товаров"'), "no literal crumb")
  const listed = new Map(OWNER_ROUTES.map((route) => [route.path, route]))
  for (const path of [
    "/product-attributes/create",
    "/product-attributes/:attribute_id/edit",
    "/product-attributes/:attribute_id/translations/edit",
    "/product-attributes/:attribute_id/values/edit",
  ]) {
    assert.equal(listed.get(path)?.kind, "overlay", `${path} is an overlay of the walker`)
  }
  assert.ok(listed.has("/product-attributes?q=zzzz-nothing-matches"))
})

test("the walker opens a choice list when the stand has one", async () => {
  const api = async () => ({ product_attributes: [{ id: "a", type: "text" }, { id: "b", type: "select" }] })
  assert.equal(await PARAM_RESOLVERS.attribute_id(api), "b")
  assert.equal(await PARAM_RESOLVERS.attribute_id(async () => ({ product_attributes: [{ id: "a", type: "text" }] })), "a")
})

// ── the list ────────────────────────────────────────────────────────────────

test("the list reads only: no form, no native select, no hand-made table", () => {
  for (const forbidden of ["<form", "<select", "<Input", "<Table>", "useState", "useCreateProductAttribute"]) {
    assert.ok(!list.includes(forbidden), `the list must not carry ${forbidden}`)
  }
  assert.ok(list.includes("<_DataTable") && list.includes("search") && list.includes("const PAGE_SIZE = 20"))
  assert.ok(list.includes("navigateTo={(row) => `/product-attributes/${row.original.id}`}"))
  assert.ok(list.includes('<Link to="/product-attributes/create">'))
  assert.ok(list.includes("hasOutlet"), "the create modal opens in the list's outlet")
})

test("two flags, two columns, said in words: «Показывается / Скрыта» and «Есть / Нет»", () => {
  const columns = [...list.matchAll(/header: t\("productAttributes\.columns\.(\w+)"\)/g)].map((m) => m[1])
  assert.deepEqual(columns, ["name", "key", "type", "category", "showOnProduct", "filter"])
  assert.equal(ru.productAttributes.shown, "Показывается")
  assert.equal(ru.productAttributes.hidden, "Скрыта")
  assert.equal(ru.productAttributes.filterOn, "Есть")
  assert.equal(ru.productAttributes.filterOff, "Нет")
})

test("«Добавить стандартные» stays in the header, off once the set is whole; its toast counts what it added", () => {
  assert.ok(list.includes("disabled={!preset || missing === 0}"))
  assert.ok(list.includes('t("productAttributes.preset.added", { count: result.created.length })'))
  assert.ok(!list.includes("Стандартный набор на месте"), "the line about the set is gone")
})

test("empty: «Характеристик пока нет» with one «Создать»; the header keeps «Добавить стандартные»", () => {
  const empty = list.slice(list.indexOf("<NoRecords"), list.indexOf("/>", list.indexOf("<NoRecords")))
  assert.ok(empty.includes('t("productAttributes.empty.title")'))
  assert.ok(empty.includes('action={{ to: "/product-attributes/create", label: t("actions.create") }}'))
  assert.ok(list.includes("{hasAttributes ? (\n              <Link"), "no second «Создать» over the empty screen")
})

test("the row's «…»: «Изменить», then «Удалить» after the separator, behind a prompt that names it", () => {
  const groups = list.slice(list.indexOf("groups={["), list.indexOf("]}\n    >"))
  assert.equal((groups.match(/actions: \[/g) ?? []).length, 2)
  assert.ok(groups.indexOf('t("actions.change")') < groups.indexOf('t("actions.delete")'))
  const remove = read(`${DIR}/use-attribute-delete.ts`)
  assert.match(remove, /await prompt\(\{[\s\S]*?variant: "danger"/)
  assert.ok(remove.includes('t("productAttributes.delete.description", { name: attribute.name })'))
})

// ── the create modal ────────────────────────────────────────────────────────

test("the create is a RouteFocusModal of three fields with the panel's Select, and leads to the card", () => {
  assert.ok(create.includes("<RouteFocusModal>") && create.includes("<RouteFocusModal.Form form={form}>"))
  assert.ok(create.includes("<Select ") && !create.includes("<select"))
  for (const name of ["name", "key", "type"]) {
    assert.ok(create.includes(`name="${name}"`), `field ${name}`)
  }
  assert.ok(create.includes("handleSuccess(`/product-attributes/${product_attribute.id}`)"))
  assert.ok(create.includes("form.setValue(\"key\", suggestMachineValue(event.target.value))"), "the machine name follows the name")
  assert.ok(create.includes("keyTouched.current = true"), "until the owner edits it")
})

// ── the card and its drawers ────────────────────────────────────────────────

test("the card reads three sections and edits each in its own drawer", () => {
  for (const forbidden of ["<form", "<Input", "<select", "<Switch", "<Prompt", "mutateAsync", "actions.save"]) {
    assert.ok(!card.includes(forbidden), `the card must not carry ${forbidden}`)
  }
  assert.ok(card.includes('<SettingsDetailSection section={general} level="h1" />'))
  assert.ok(card.includes("{locales.length ? <SettingsDetailSection section={translations} /> : null}"))
  assert.ok(card.includes('{attribute.type === "select" ? <ValuesSection'))
  assert.ok(card.includes('to: "edit"') && card.includes('editTo: "translations/edit"') && card.includes('to: "values/edit"'))
  const rows = [...card.matchAll(/id: "([\w-]+)",\s*label: t\(/g)].map((m) => m[1])
  for (const id of ["name", "key", "type", "position", "category", "show-on-product", "use-as-filter"]) {
    assert.ok(rows.includes(id), `row ${id}`)
  }
  assert.ok(card.includes("<TableScroll>"), "the values table sits in TableScroll")
  assert.ok(card.includes('navigate("/product-attributes", { replace: true })'), "after «Удалить» back to the list")
})

test("each drawer is a SettingsEditDrawer that saves through the one hook", () => {
  for (const file of ["attribute-edit/attribute-edit.tsx", "attribute-translations-edit/attribute-translations-edit.tsx", "attribute-values-edit/attribute-values-edit.tsx"]) {
    const source = read(`${DIR}/${file}`)
    assert.ok(source.includes("<SettingsEditDrawer<"), file)
    assert.ok(source.includes("useAttributeSave()") && source.includes("successMessage={savedMessage}"), file)
    assert.ok(!source.includes("useUpdateProductAttribute"), `${file} must go through useAttributeSave`)
  }
  const hook = read(`${DIR}/use-attribute-save.ts`)
  assert.ok(hook.includes('mutateAsync(attributeBody(attribute!, patch, t("productAttributes.values.starter")))'))
  assert.ok(hook.includes('t("productAttributes.savedCleared", { count: cleared })'))
})

test("the general drawer: the machine name locked with its reason, Selects not native, the unit kept for numbers", () => {
  assert.ok(general.includes("disabled readOnly") && general.includes('t("productAttributes.fields.keyLocked")'))
  assert.ok(!general.includes("<select") && general.includes("<Select.Item value={ALL_CATALOG}>"))
  assert.ok(general.includes('{type === "number" ? (') && general.includes('name="unit"'))
  assert.ok(general.includes('category_id: draft.category === ALL_CATALOG ? null : draft.category'))
  assert.equal((general.match(/<SwitchBox/g) ?? []).length, 2)
})

test("the values drawer sends the whole list and refuses an empty or broken one before the server", () => {
  assert.ok(values.includes("useFieldArray"))
  assert.ok(values.includes("const problem = optionsProblem(draft.options)"))
  assert.ok(values.includes('t("productAttributes.values.drawerHint")'))
  assert.ok(values.includes('aria-label={t("productAttributes.values.remove")}'))
  assert.ok(values.includes('if (attribute && attribute.type !== "select")'), "no values drawer on another type")
})

// ── the data rules, run for real ────────────────────────────────────────────

test("a drawer's save is the saved record with its fields on top; the values go with a list", () => {
  const body = attributeBody(saved, { name: " Страна " }, "Значение 1")
  assert.equal(body.name, "Страна")
  assert.equal(body.type, "select")
  assert.equal(body.position, 5)
  assert.equal(body.use_as_filter, true)
  assert.deepEqual(body.translations, { en: "Country of origin" }, "a blank translation is dropped")
  assert.deepEqual(body.options.map((o) => o.value), ["rossiya", "belarus"], "values keep their order")
  const general = attributeBody(saved, { show_on_product: false, category_id: null }, "Значение 1")
  assert.equal(general.show_on_product, false)
  assert.equal(general.options.length, 2, "the general drawer does not drop the values")
})

test("switching to a list with no values sends the starter value; another type sends none", () => {
  const text = { ...saved, type: "text", options: [] }
  const toList = attributeBody(text, { type: "select" }, "Значение 1")
  assert.deepEqual(toList.options, [{ value: STARTER_OPTION_VALUE, label: "Значение 1", translations: {} }])
  assert.equal(attributeBody(saved, { type: "number", unit: "мл" }, "x").options, undefined)
  assert.equal(attributeBody(saved, { type: "number", unit: "мл" }, "x").unit, "мл")
  assert.equal(ALL_CATALOG.length > 0, true)
})

test("the values drawer's checks: at least one, each complete, no two machine names alike", () => {
  assert.equal(optionsProblem([]), "empty")
  assert.equal(optionsProblem([{ label: "Россия", value: "rossiya" }]), null)
  assert.equal(optionsProblem([{ label: " ", value: "rossiya" }]), "incomplete")
  assert.equal(optionsProblem([{ label: "Россия", value: "Rossiya!" }]), "incomplete")
  assert.equal(optionsProblem([{ label: "А", value: "a" }, { label: "Б", value: "a" }]), "duplicate")
  assert.deepEqual(cleanTranslations({ en: " Russia ", de: "" }), { en: "Russia" })
})

test("the list's search matches the name or the machine name; 20 a page", () => {
  const rows = Array.from({ length: 26 }, (_, i) => ({ ...saved, id: `a${i}`, name: `Свойство ${i}`, key: `prop_${i}` }))
  assert.equal(attributeListPage(rows, { limit: 20 }).rows.length, 20)
  assert.equal(attributeListPage(rows, { offset: 20, limit: 20 }).rows.length, 6)
  assert.equal(attributeListPage(rows, { q: "PROP_25", limit: 20 }).rows[0].id, "a25")
  assert.equal(attributeListPage(rows, { q: "свойство 1", limit: 20 }).count, 11)
  assert.deepEqual(attributeListPage(rows, { q: "nothing", limit: 20 }), { rows: [], count: 0 })
})

// ── words ───────────────────────────────────────────────────────────────────

test("no literal Russian string and no default fallback in the screens' code (rule 7)", () => {
  for (const file of FILES) {
    const code = read(file).replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
    assert.ok(!/["'`>][^"'`<>{}]*[А-Яа-яЁё]{3,}/.test(code), `${file}: no Russian literal`)
    assert.ok(!code.includes("defaultValue:"), `${file}: no default fallback`)
  }
})

test("every key the screens read exists in ru.json and en.json; counted phrases have their plural forms", () => {
  const keys = new Set(FILES.flatMap((file) => [...read(file).matchAll(/\bt\("([A-Za-z0-9_.]+)"/g)].map((m) => m[1])))
  for (const type of ["text", "number", "select", "boolean"]) {
    keys.add(`productAttributes.types.${type}`)
    keys.add(`productAttributes.typeHints.${type}`)
  }
  for (const problem of ["empty", "incomplete", "duplicate"]) keys.add(`productAttributes.values.errors.${problem}`)
  assert.ok(keys.size > 50, `expected the screens' keys, found ${keys.size}`)
  for (const key of keys) {
    for (const [name, catalog] of [["ru", ru], ["en", en]]) {
      const value = lookup(catalog, key) ?? lookup(catalog, `${key}_other`)
      assert.equal(typeof value, "string", `${name}.json is missing "${key}"`)
    }
  }
  for (const [node, key] of [[ru.productAttributes.preset, "added"], [ru.productAttributes, "savedCleared"]]) {
    for (const form of ["one", "few", "many", "other"]) {
      assert.equal(typeof node[`${key}_${form}`], "string", `ru ${key}_${form}`)
    }
  }
  assert.match(ru.productAttributes.preset.added_one, /^Добавлена \{\{count\}\} характеристика$/)
  assert.match(ru.productAttributes.preset.added_few, /\{\{count\}\} характеристики$/)
  assert.match(ru.productAttributes.preset.added_many, /\{\{count\}\} характеристик$/)
})
