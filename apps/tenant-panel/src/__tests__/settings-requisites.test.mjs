import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * t-2026-10-14-01 (panel redesign, stage 3, G1 part 2): `/settings/requisites`
 * rebuilt on `SettingsDetail` + five `SettingsEditDrawer`s. This package cannot
 * render JSX (no vitest/jsdom, see `settings-detail-edit-drawer.test.mjs`), so
 * the contract is asserted on the source.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const read = (path) => readFileSync(join(SRC, path), "utf8")

const page = read("routes/settings/requisites/requisites.tsx")
const model = read("routes/settings/requisites/requisites-model.ts")
const fields = read("routes/settings/requisites/requisites-fields.tsx")
const hook = read("routes/settings/requisites/use-requisites-edit.ts")
const app = read("app.tsx")
const ownerRoutes = readFileSync(join(SRC, "..", "e2e", "owner-routes.mjs"), "utf8")
const ru = JSON.parse(read("i18n/translations/ru.json"))
const en = JSON.parse(read("i18n/translations/en.json"))

const DRAWERS = {
  edit: ["legal_name", "inn", "ogrn", "legal_address"],
  "edit-contacts": ["phone", "phone_confirmed", "email", "return_address", "delivery_methods"],
  "edit-personal": ["dpo_email", "rkn_reg_number", "rkn_notice_date"],
  "edit-dates": ["document_date", "effective_date", "revision_date"],
  "edit-other": ["newsletter_management_url", "bank_details"],
}
const drawerSource = (name) => read(`routes/settings/requisites/${name}.tsx`)
const lookup = (catalog, key) =>
  key.split(".").reduce((node, part) => (node == null ? node : node[part]), catalog)

// The 16 stored values of the record, the checklist of «nothing is lost».
const RECORD = [
  "legal_name", "inn", "ogrn", "legal_address", "return_address", "phone", "phone_confirmed",
  "email", "dpo_email", "delivery_methods", "effective_date", "revision_date", "document_date",
  "rkn_notice_date", "rkn_reg_number", "newsletter_management_url", "bank_details",
]

test("the page only reads: a SettingsDetail with five sections, no form, no save", () => {
  assert.ok(page.includes("<SettingsDetail"))
  for (const forbidden of ["<form", "<Input", "<Textarea", "<Button", "mutateAsync", "toast.", "useUpdateRequisites", "actions.save"]) {
    assert.ok(!page.includes(forbidden), `the read page must not carry ${forbidden}`)
  }
  for (const id of ["seller", "contacts", "personal", "dates", "other"]) {
    assert.ok(page.includes(`id: "${id}"`), `section ${id}`)
  }
})

test("sections come in the prototype's order: seller, contacts, personal, dates, other", () => {
  const order = ["seller", "contacts", "personal", "dates", "other"].map((id) => page.indexOf(`id: "${id}"`))
  assert.deepEqual([...order].sort((a, b) => a - b), order)
})

test("every field of the record is re-homed in exactly one drawer (nothing lost, nothing twice)", () => {
  const homed = Object.values(DRAWERS).flat()
  assert.deepEqual([...homed].sort(), [...RECORD].sort())
  for (const [route, names] of Object.entries(DRAWERS)) {
    const source = drawerSource(route)
    for (const name of names) {
      assert.ok(
        source.includes(`${name}: zod.`) && source.includes(`${name}: saved.${name}`),
        `${route}: ${name} must be in the schema and in the defaults`
      )
    }
  }
})

test("each section's fields in the model match the drawer that edits them", () => {
  const section = (id) => model.slice(model.indexOf(`  ${id}: {`), model.indexOf("  },", model.indexOf(`  ${id}: {`)))
  const pairs = { seller: "edit", contacts: "edit-contacts", personal: "edit-personal", dates: "edit-dates", other: "edit-other" }
  for (const [id, route] of Object.entries(pairs)) {
    assert.ok(section(id).includes(`editTo: "${route}"`), `${id} opens ${route}`)
    for (const name of DRAWERS[route].filter((n) => n !== "phone_confirmed")) {
      assert.ok(section(id).includes(`"${name}"`), `${id} lists ${name}`)
    }
  }
})

test("each drawer is a SettingsEditDrawer on its own nested route, registered next to the page", () => {
  for (const route of Object.keys(DRAWERS)) {
    assert.ok(drawerSource(route).includes("<SettingsEditDrawer"), `${route}`)
    assert.ok(drawerSource(route).includes("export { "), `${route} exports Component`)
    assert.ok(app.includes(`path: "${route}",`), `app.tsx registers ${route}`)
    assert.ok(app.includes(`import("./routes/settings/requisites/${route}")`), `app.tsx lazy-loads ${route}`)
    assert.ok(ownerRoutes.includes(`{ path: "/settings/requisites/${route}", kind: "overlay" }`), `owner-routes.mjs lists ${route}`)
  }
})

test("one mutation hook; every drawer sends the whole record with its own fields replaced", () => {
  assert.equal((hook.match(/useUpdateRequisites\(\)/g) ?? []).length, 1)
  assert.ok(hook.includes("mutateAsync({ ...saved, ...values })"))
  for (const route of Object.keys(DRAWERS)) {
    assert.ok(drawerSource(route).includes("useRequisitesEdit()"), route)
    assert.ok(!drawerSource(route).includes("useUpdateRequisites"), `${route} must go through the shared hook`)
  }
})

// The branch of `fieldRow` that builds an empty row.
const emptyRow = page.slice(page.indexOf("if (!text) {"), page.indexOf("value: DATE_FIELDS.includes(field)"))

test("the «не заполнено: N» counter is an orange badge in the first section", () => {
  const first = page.slice(page.indexOf('id: "seller"'), page.indexOf('id: "contacts"'))
  assert.ok(first.includes('color: "orange"') && first.includes('t("requisitesSettings.missingCount"'))
})

test("an empty row carries the orange «не заполнено» badge and no caption with the pages (Ivan, 14.10)", () => {
  assert.ok(emptyRow.length > 0, "fieldRow has an empty-row branch")
  assert.ok(emptyRow.includes('{ color: "orange", label: t("requisitesSettings.notFilled") }'))
  assert.ok(!emptyRow.includes("hint"), "an empty row has no second line")
  assert.ok(!page.includes("neededOn") && !page.includes("pagesByField"), "the page never names the pages under a row")
  for (const [name, catalog] of [["ru", ru], ["en", en]]) {
    const keys = Object.keys(catalog.requisitesSettings)
    assert.ok(!keys.some((key) => key.startsWith("neededOn")), `${name}.json keeps no neededOn keys`)
    assert.ok(!/нужен на страниц|needed on the page/.test(JSON.stringify(catalog.requisitesSettings)), `${name}.json has no pages caption`)
  }
})

test("the empty return address is optional: a grey «необязательно» badge, no caption", () => {
  assert.ok(emptyRow.includes('field === "return_address"'))
  assert.ok(emptyRow.includes('{ color: "grey", label: t("requisitesSettings.optional") }'))
  assert.equal(ru.requisitesSettings.optional, "необязательно")
  assert.equal(en.requisitesSettings.optional, "optional")
  assert.equal(ru.requisitesSettings.returnAddressOptional, undefined, "the long caption key is gone")
})

test("dates use the panel's DatePicker, never the native date input", () => {
  assert.ok(fields.includes("<DatePicker"))
  for (const source of [fields, ...Object.keys(DRAWERS).map(drawerSource)]) {
    assert.ok(!/type=["']date["']/.test(source), "no native date input")
  }
  for (const name of ["document_date", "effective_date", "revision_date", "rkn_notice_date"]) {
    const home = Object.entries(DRAWERS).find(([, names]) => names.includes(name))[0]
    assert.ok(drawerSource(home).includes(`<RequisiteDateInput control={form.control} name="${name}"`), `${name} is a date picker`)
  }
})

test("bank details are a Textarea in the «other» drawer; the domain is read-only with a hint", () => {
  assert.ok(drawerSource("edit-other").includes('name="bank_details" multiline'))
  assert.ok(fields.includes("<Textarea"))
  assert.ok(!Object.values(DRAWERS).flat().includes("domain"))
  assert.ok(page.includes('t("requisitesSettings.domain.hint")'))
  assert.equal(ru.requisitesSettings.domain.hint.includes("«Адрес магазина»"), true)
  // The platform counts an unresolved domain in «не заполнено: N»: its row carries the badge too.
  const domainRow = page.slice(page.indexOf('id: "domain"'), page.indexOf("]", page.indexOf('id: "domain"')))
  assert.ok(domainRow.includes('t("requisitesSettings.notFilled")'), "an empty domain row carries «не заполнено»")
})

test("the phone confirmation is a Switch in the contacts drawer, not a link under a field", () => {
  const contacts = drawerSource("edit-contacts")
  assert.ok(contacts.includes("<SwitchBox"), "DS table: Switch in SwitchBox")
  assert.ok(!contacts.includes("<Switch "))
  assert.ok(contacts.includes('name="phone_confirmed"'))
  assert.ok(!page.includes("confirm-phone") && !page.includes("<button"))
})

test("read-page dates go through the panel's shared formatter (DS rule 14)", () => {
  assert.ok(page.includes("getFullDate({ date })"))
  assert.ok(!page.includes("Intl.DateTimeFormat"))
})

test("a text the picker cannot read is kept and shown as written until a date is picked", () => {
  assert.ok(fields.includes('t("requisitesSettings.dateAsWritten"'))
  assert.ok(model.includes("DAY_MONTH_YEAR") && model.includes("YEAR_MONTH_DAY"))
})

test("no {{TOKEN}} jargon on screen and no literal Russian or English string in the screen's code", () => {
  const sources = [page, fields, ...Object.keys(DRAWERS).map(drawerSource)]
  for (const source of sources) {
    // Comments may name tokens; strings the owner reads may not.
    const code = source.replace(/\/\/.*$/gm, "")
    assert.ok(!/\{\{[А-ЯA-Z_]+\}\}|ТОКЕН/.test(code.replace(/\{\{(count|pages|title|value)\}\}/g, "")), "no token jargon")
    assert.ok(!/["'`>][^"'`<>{}]*[А-Яа-я]{3,}/.test(code), "no Russian literal in code")
    assert.ok(!source.includes("defaultValue:"), "no English default fallback")
  }
  for (const catalog of [ru, en]) {
    assert.ok(!JSON.stringify(catalog.requisitesSettings).includes("{{ТОК"))
  }
})

test("every i18n key the screen reads exists in ru.json and en.json", () => {
  const sources = [page, fields, ...Object.keys(DRAWERS).map(drawerSource)]
  const keys = new Set(
    sources.flatMap((source) => [...source.matchAll(/\bt\("([A-Za-z0-9_.]+)"/g)].map((m) => m[1]))
  )
  // The field label and hint keys are built from the field name.
  for (const name of RECORD.filter((n) => n !== "phone_confirmed")) keys.add(`requisitesSettings.fields.${name}.label`)
  for (const name of ["legal_name", "delivery_methods", "bank_details"]) keys.add(`requisitesSettings.fields.${name}.hint`)
  for (const id of ["contacts", "personal", "dates", "other"]) {
    keys.add(`requisitesSettings.sections.${id}.title`)
    keys.add(`requisitesSettings.sections.${id}.description`)
  }
  assert.ok(keys.size > 30, `expected the screen's keys, found ${keys.size}`)
  for (const key of keys) {
    for (const [name, catalog] of [["ru", ru], ["en", en]]) {
      const value = lookup(catalog, key) ?? lookup(catalog, `${key}_other`)
      assert.equal(typeof value, "string", `${name}.json is missing "${key}"`)
    }
  }
})

test("the counted phrase has Russian plural forms (one, few, many, other) and English one, other", () => {
  for (const form of ["one", "few", "many", "other"]) {
    assert.equal(typeof ru.requisitesSettings.hidden[`item_${form}`], "string", `ru hidden.item_${form}`)
  }
  for (const form of ["one", "other"]) {
    assert.equal(typeof en.requisitesSettings.hidden[`item_${form}`], "string", `en hidden.item_${form}`)
  }
  assert.ok(page.includes('t("requisitesSettings.hidden.item", { title: page.title, count: page.hidden })'))
})

test("the Russian plural forms read right: 1 блок, 2 блока, 5 блоков", () => {
  const item = ru.requisitesSettings.hidden
  assert.match(item.item_one, /\{\{count\}\} блок$/)
  assert.match(item.item_few, /\{\{count\}\} блока$/)
  assert.match(item.item_many, /\{\{count\}\} блоков$/)
})

test("the breadcrumb comes from a key, not a literal", () => {
  assert.ok(app.includes('path: "/settings/requisites",\n            handle: { breadcrumb: () => t("requisitesSettings.title") }'))
  assert.equal(ru.requisitesSettings.title, "Реквизиты продавца")
})
