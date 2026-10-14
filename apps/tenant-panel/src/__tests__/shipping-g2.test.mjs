import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import i18n from "i18next"

import { OWNER_ROUTES } from "../../e2e/owner-routes.mjs"
import {
  SHIPPING_COUNTRIES,
  TARIFF_KINDS,
  carrierLabel,
  countryName,
  isDefaultWeight,
  methodZoneSummary,
  moveMethodIds,
  tariffSummary,
  zoneSummary,
} from "../routes/shipping/labels.ts"

/**
 * t-2026-10-14-01 (panel redesign, stage 3, G2 «Список и карточка»):
 * `/shipping` rebuilt after the prototype. The list is `_DataTable` whose row
 * opens the method's card and whose «…» holds what the row's arrows, switch
 * and icons did; the default weight is a read section with its own drawer;
 * the card `/shipping/:id` reads three sections and opens the existing edit.
 * This package cannot render JSX (see `settings-detail-edit-drawer.test.mjs`),
 * so the screens are asserted on their source; the labels, the money, the
 * plural forms and the move run for real against ru.json.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const read = (path) => readFileSync(join(SRC, path), "utf8")

const app = read("app.tsx")
const ru = JSON.parse(read("i18n/translations/ru.json"))
const en = JSON.parse(read("i18n/translations/en.json"))
const lookup = (catalog, key) =>
  key.split(".").reduce((node, part) => (node == null ? node : node[part]), catalog)

const DIR = "routes/shipping"
const FILES = [
  `${DIR}/labels.ts`,
  `${DIR}/use-method-actions.ts`,
  `${DIR}/shipping-list/shipping-list.tsx`,
  `${DIR}/shipping-detail/shipping-detail.tsx`,
  `${DIR}/shipping-detail/breadcrumb.tsx`,
  `${DIR}/shipping-weight-edit/shipping-weight-edit.tsx`,
  `${DIR}/shipping-edit/shipping-edit.tsx`,
  `${DIR}/shipping-create/shipping-create.tsx`,
  `${DIR}/shipping-zones/shipping-zones.tsx`,
  `${DIR}/components/shipping-method-form/shipping-method-form.tsx`,
]
const list = read(`${DIR}/shipping-list/shipping-list.tsx`)
const card = read(`${DIR}/shipping-detail/shipping-detail.tsx`)
const weight = read(`${DIR}/shipping-weight-edit/shipping-weight-edit.tsx`)
const actions = read(`${DIR}/use-method-actions.ts`)

const plain = (s) => s.replace(/[\u00a0\u202f]/g, " ")

await i18n.init({
  lng: "ru",
  resources: { ru: { translation: ru } },
  interpolation: { escapeValue: false },
})
const t = i18n.getFixedT("ru")

const method = (patch = {}) => ({
  id: "so_1",
  name: "Почта России — до отделения",
  description: null,
  delivery_hint: "5–14 дней",
  enabled: true,
  tariff: { kind: "per_kg", base_amount: 350, per_kg_amount: 120, min_weight_g: null },
  tariff_source: null,
  zone: { country_code: "ru", provinces: [] },
  zone_label: "",
  carrier: "post_ru",
  sort_order: 4,
  currency_code: "rub",
  ...patch,
})

// ── the router and the walker ───────────────────────────────────────────────

test("the card, its edit and the weight drawer are routes; the crumb is a key", () => {
  const block = app.slice(app.indexOf('path: "/shipping",'), app.indexOf('path: "/reviews"'))
  assert.ok(block.includes('breadcrumb: () => t("shippingMethods.title")'), "the crumb reads the key")
  assert.ok(!block.includes("defaultValue"), "no literal fallback in the crumb (rule 7)")
  const list = block.slice(block.indexOf('path: ""'), block.indexOf('path: ":id"'))
  for (const child of ['path: "create"', 'path: "zones"', 'path: "settings/weight/edit"']) {
    assert.ok(list.includes(child), `the list keeps ${child} over itself`)
  }
  assert.ok(list.includes('import("./routes/shipping/shipping-weight-edit")'))
  assert.ok(!list.includes('path: ":id/edit"'), "the edit moved under the card")
  const detail = block.slice(block.indexOf('path: ":id"'))
  assert.ok(detail.includes('"./routes/shipping/shipping-detail"'))
  assert.ok(detail.includes("breadcrumb: (match: UIMatch) => <Breadcrumb {...match} />"), "the crumb is the method's name")
  assert.ok(detail.includes('path: "edit"') && detail.includes('import("./routes/shipping/shipping-edit")'))
})

test("every new address is in the owner-route manifest (rule 16)", () => {
  const byPath = new Map(OWNER_ROUTES.map((route) => [route.path, route]))
  assert.equal(byPath.get("/shipping/settings/weight/edit")?.kind, "overlay")
  assert.ok(byPath.has("/shipping/:shipping_option_id"), "the card is walked")
  assert.equal(byPath.get("/shipping/:shipping_option_id").kind, undefined, "the card is a page")
  assert.equal(byPath.get("/shipping/:shipping_option_id/edit")?.kind, "overlay")
})

// ── the list ────────────────────────────────────────────────────────────────

test("the list is _DataTable without search or pages; a row opens the card", () => {
  assert.ok(list.includes("<_DataTable"))
  assert.ok(list.includes("pagination={false}"), "the checkout order is one page")
  assert.ok(!/\bsearch\b(?!\w)/.test(list.slice(list.indexOf("<_DataTable"))), "no search over an ordered list")
  assert.ok(list.includes("enablePagination: false"))
  assert.ok(list.includes("navigateTo={(row) => `/shipping/${row.original.id}`}"))
  for (const gone of ["<Table>", "<Switch", "ArrowUpMini", "ArrowDownMini", "<form", "<Input", "mutateAsync"]) {
    assert.ok(!list.includes(gone), `the list page must not carry ${gone} any more`)
  }
})

test("the row's «…»: change, then up / down, then hide or show and delete last (E6)", () => {
  const menu = list.slice(list.indexOf("const MethodRowActions"), list.indexOf("const useColumns"))
  const at = (needle) => {
    const index = menu.indexOf(needle)
    assert.ok(index !== -1, `missing ${needle}`)
    return index
  }
  const change = at('label: t("actions.change")')
  const up = at('label: t("shippingMethods.actions.moveUp")')
  const down = at('label: t("shippingMethods.actions.moveDown")')
  const visibility = at("label: visibility.label")
  const remove = at('label: t("actions.delete")')
  assert.ok(change < up && up < down && down < visibility && visibility < remove)
  assert.ok(menu.includes("to: `/shipping/${method.id}/edit`"), "«Изменить» opens the existing edit")
  assert.ok(menu.includes("disabled: index === 0 || isMoving"), "the first row cannot go up")
  assert.ok(menu.includes("disabled: index === count - 1 || isMoving"), "the last row cannot go down")
  assert.ok(menu.includes('aria-label={t("fields.actions")}'), "the «…» button has a name")
})

test("the state is one StatusBadge, «Показывается / Скрыт» (E7)", () => {
  assert.ok(list.includes('<StatusBadge color={getValue() ? "green" : "grey"} className="whitespace-nowrap">'))
  assert.equal(ru.shippingMethods.state.shown, "Показывается")
  assert.equal(ru.shippingMethods.state.hidden, "Скрыт")
})

test("empty: NoRecords with «Добавить способ»; «Зоны по России» stays in the header (E8)", () => {
  assert.ok(list.includes("<NoRecords"))
  assert.ok(list.includes('action={{ to: "/shipping/create", label: t("shippingMethods.addMethod") }}'))
  assert.ok(list.includes('<Link to="/shipping/zones">{t("shippingMethods.zonesButton")}</Link>'))
  assert.ok(list.includes("{hasMethods ? ("), "the header's «Добавить способ» gives way to the empty state's")
  assert.equal(ru.shippingMethods.empty.title, "Способов доставки пока нет")
})

test("the default weight is a read section; its «…» opens the drawer", () => {
  assert.ok(list.includes("<SettingsDetailSection"))
  assert.ok(list.includes('editTo: "settings/weight/edit"'))
  assert.ok(weight.includes("<SettingsEditDrawer"))
  assert.ok(weight.includes("zod.string().refine(isDefaultWeight"))
  assert.ok(weight.includes("mutateAsync({ default_weight_g: Number(values.grams) })"))
  assert.ok(weight.includes('<Form.Hint>{t("shippingMethods.weight.hint")}</Form.Hint>'), "the long hint moved into the drawer")
  assert.ok(weight.includes("isPending={isPending || !settings}"), "the form mounts with the saved weight")
})

// ── the shared actions ──────────────────────────────────────────────────────

test("hiding and deleting ask first, naming the method; showing again does not (rule 8)", () => {
  const visibility = actions.slice(actions.indexOf("export const useMethodVisibility"), actions.indexOf("export const useMethodDelete"))
  assert.ok(visibility.includes("if (!enabled) {"), "only hiding is confirmed")
  assert.ok(visibility.includes('description: t("shippingMethods.hidePrompt.description", { name: method.name })'))
  assert.ok(visibility.indexOf("if (!confirmed)") < visibility.indexOf("await mutateAsync({ enabled })"))
  const remove = actions.slice(actions.indexOf("export const useMethodDelete"), actions.indexOf("export const useMethodMove"))
  assert.ok(remove.includes('description: t("shippingMethods.deletePrompt.description", { name: method.name })'))
  assert.ok(remove.indexOf("if (!confirmed)") < remove.indexOf("await mutateAsync(method.id)"))
  for (const toast of ["shown", "hidden", "deleted", "moved"]) {
    assert.ok(actions.includes(`toast.success(`) && actions.includes(`shippingMethods.toast.${toast}`), `toast ${toast}`)
  }
  assert.equal((actions.match(/toast\.error\(\(error as Error\)\.message\)/g) ?? []).length, 3, "every refusal shows the platform's text")
})

test("a move sends the whole sequence to POST reorder, as the arrows did", () => {
  assert.ok(actions.includes("useReorderShippingMethods()"))
  assert.ok(actions.includes("await mutateAsync(ids)"))
  assert.deepEqual(moveMethodIds(["a", "b", "c"], 1, -1), ["b", "a", "c"])
  assert.deepEqual(moveMethodIds(["a", "b", "c"], 1, 1), ["a", "c", "b"])
  assert.equal(moveMethodIds(["a", "b", "c"], 0, -1), null, "the first cannot go up")
  assert.equal(moveMethodIds(["a", "b", "c"], 2, 1), null, "the last cannot go down")
  assert.equal(moveMethodIds(["a"], 5, 1), null)
  const ids = ["a", "b"]
  moveMethodIds(ids, 0, 1)
  assert.deepEqual(ids, ["a", "b"], "the list in the cache is not mutated")
})

// ── the card ────────────────────────────────────────────────────────────────

test("the card reads three sections from the list; each «…» opens the existing edit", () => {
  assert.ok(card.includes("useShippingMethods()"), "the card reads the same list")
  for (const id of ['id: "general"', 'id: "zone"', 'id: "price"']) {
    assert.ok(card.includes(id), `missing section ${id}`)
  }
  assert.ok(card.includes('actions: [{ icon: <PencilSquare />, label: t("actions.change"), to: "edit" }]'))
  assert.equal((card.match(/actions: \[edit\]/g) ?? []).length, 2, "zone and price open the same edit")
  assert.ok(card.includes('value: t("shippingMethods.card.placeValue", { place, total })'), "«5 из 7»")
  assert.ok(card.includes('level={index === 0 ? "h1" : "h2"}'), "the method's name is the h1")
  for (const forbidden of ["<form", "<Input", "<Switch", "mutateAsync"]) {
    assert.ok(!card.includes(forbidden), `the card must not carry ${forbidden}`)
  }
})

test("the card's first «…» ends with hide / show and delete; delete returns to the list", () => {
  const general = card.slice(card.indexOf('id: "general"'), card.indexOf('id: "zone"'))
  assert.ok(general.indexOf("label: visibility.label") < general.indexOf('label: t("actions.delete")'))
  assert.ok(general.includes('navigate("/shipping", { replace: true })'))
})

test("a method that is not in the list reads «not found»", () => {
  assert.ok(card.includes('throw new FetchError(t("shippingMethods.card.notFound"), "Not Found", 404)'))
})

test("the price rows follow the tariff; the starting price is said under «Как считается»", () => {
  assert.ok(card.includes('method.tariff_source === "provisioned-default"'))
  for (const key of ["amount", "baseAmount", "perKg", "minWeight", "freeAbove"]) {
    assert.ok(card.includes(`t("shippingMethods.card.price.${key}")`), `missing row ${key}`)
  }
})

// ── words and money, run for real ───────────────────────────────────────────

test("money is the panel's: «350,00 ₽ + 120,00 ₽/кг» (rule 14)", () => {
  assert.equal(plain(tariffSummary(t, method().tariff, "rub")), "350,00 ₽ + 120,00 ₽/кг")
  assert.equal(
    plain(tariffSummary(t, { kind: "per_kg", base_amount: 0, per_kg_amount: 90, min_weight_g: 500 }, "rub")),
    "90,00 ₽/кг, минимум 500 г"
  )
  assert.equal(tariffSummary(t, { kind: "flat", amount: 0 }, "rub"), "Бесплатно")
  assert.equal(plain(tariffSummary(t, { kind: "flat", amount: 300 }, "rub")), "300,00 ₽")
  assert.equal(
    plain(tariffSummary(t, { kind: "free_above", amount: 300, free_above_total: 5000 }, "rub")),
    "300,00 ₽, бесплатно от 5 000,00 ₽"
  )
})

test("zones read in words, with Russian plural forms", () => {
  assert.equal(zoneSummary(t, null), "Все страны магазина")
  assert.equal(zoneSummary(t, { country_code: "RU", provinces: [] }), "Россия, вся страна")
  assert.equal(zoneSummary(t, { country_code: "ru", provinces: ["a"] }), "Россия, 1 регион")
  assert.equal(zoneSummary(t, { country_code: "ru", provinces: ["a", "b", "c"] }), "Россия, 3 региона")
  assert.equal(zoneSummary(t, { country_code: "ru", provinces: Array(11).fill("x") }), "Россия, 11 регионов")
  assert.equal(methodZoneSummary(t, method({ zone_label: "Урал" })), "Урал", "the backend's own zone name wins")
  for (const form of ["one", "few", "many", "other"]) {
    assert.equal(typeof ru.shippingMethods.zone[`regions_${form}`], "string", `ru plural ${form}`)
    assert.equal(typeof ru.shippingMethods.zones[`regionCount_${form}`], "string", `ru plural ${form}`)
  }
})

test("carriers and countries are keys; an unknown one shows as stored", () => {
  assert.equal(carrierLabel(t, "post_ru"), "Почта России")
  assert.equal(carrierLabel(t, "dhl"), "dhl")
  assert.equal(carrierLabel(t, null), null)
  assert.equal(countryName(t, "kz"), "Казахстан")
  assert.equal(countryName(t, "xx"), "XX")
})

test("the default weight is a whole number of grams, 1 to 100 000", () => {
  for (const ok of ["1", "500", "100000"]) assert.ok(isDefaultWeight(ok), ok)
  for (const bad of ["", " ", "0", "-5", "1.5", "100001", "abc"]) assert.ok(!isDefaultWeight(bad), bad)
})

// ── i18n: every string a key (rule 7) ───────────────────────────────────────

test("every i18n key the shipping screens read exists in ru.json and en.json", () => {
  const keys = new Set(
    FILES.flatMap((file) => [...read(file).matchAll(/\bt\("([A-Za-z0-9_.]+)"/g)].map((m) => m[1]))
  )
  assert.ok(keys.size > 80, `expected the screens' keys, found ${keys.size}`)
  for (const key of keys) {
    for (const [name, catalog] of [["ru", ru], ["en", en]]) {
      const value = lookup(catalog, key) ?? lookup(catalog, `${key}_other`)
      assert.equal(typeof value, "string", `${name}.json is missing "${key}"`)
    }
  }
})

test("every key built from a value exists for each value it can take", () => {
  for (const [name, catalog] of [["ru", ru], ["en", en]]) {
    const block = catalog.shippingMethods
    for (const kind of TARIFF_KINDS) {
      assert.equal(typeof block.tariff.kinds[kind], "string", `${name}: tariff.kinds.${kind}`)
      assert.equal(typeof block.tariff.hints[kind], "string", `${name}: tariff.hints.${kind}`)
    }
    for (const code of SHIPPING_COUNTRIES) {
      assert.equal(typeof block.countries[code], "string", `${name}: countries.${code}`)
    }
    for (const carrier of ["cdek", "post_ru", "courier", "pickup"]) {
      assert.equal(typeof block.carriers[carrier], "string", `${name}: carriers.${carrier}`)
    }
    for (const field of ["amount", "base_amount", "per_kg_amount", "min_weight_g", "free_above_total"]) {
      assert.equal(typeof block.form.numberFields[field], "string", `${name}: form.numberFields.${field}`)
    }
  }
})

test("no Russian literal and no defaultValue is left in the shipping screens", () => {
  for (const file of FILES) {
    const code = read(file)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
    assert.ok(!code.includes("defaultValue:"), `${file}: a defaultValue fallback is a literal on screen`)
    const literal = code.match(/[А-Яа-яЁё][^"`\n]*/)
    assert.equal(literal, null, `${file}: a Russian literal outside the catalog: ${literal?.[0]}`)
  }
})
