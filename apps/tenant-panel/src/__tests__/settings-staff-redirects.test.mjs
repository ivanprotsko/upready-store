import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { OWNER_ROUTES, PARAM_RESOLVERS } from "../../e2e/owner-routes.mjs"
import { REDIRECT_PATH_PATTERN, redirectListPage } from "../routes/settings/redirects/redirect-list.ts"

/**
 * t-2026-10-14-01 (panel redesign, stage 3, G2 «Список и карточка»):
 * `/settings/staff` and `/settings/redirects` rebuilt after the prototype on
 * `_DataTable`, `SettingsDetail` and `SettingsEditDrawer`. This package cannot
 * render JSX (no vitest/jsdom, see `settings-detail-edit-drawer.test.mjs`), so
 * the screens are asserted on their source; the list's search and pages are a
 * plain function and run for real. `staff.test.mjs` keeps the staff form's
 * rules and the staff screen's own checks.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const read = (path) => readFileSync(join(SRC, path), "utf8")

const app = read("app.tsx")
const ru = JSON.parse(read("i18n/translations/ru.json"))
const en = JSON.parse(read("i18n/translations/en.json"))
const lookup = (catalog, key) =>
  key.split(".").reduce((node, part) => (node == null ? node : node[part]), catalog)

const STAFF_FILES = [
  "routes/settings/staff/staff.tsx",
  "routes/settings/staff/staff-actions.tsx",
  "routes/settings/staff/staff-drawer.tsx",
  "routes/settings/staff/staff-create.tsx",
  "routes/settings/staff/staff-edit.tsx",
  "routes/settings/staff/use-staff-delete.ts",
  "routes/settings/staff/use-staff-member.ts",
  "routes/settings/staff/staff-detail/staff-detail.tsx",
  "routes/settings/staff/staff-detail/breadcrumb.tsx",
]
const REDIRECT_FILES = [
  "routes/settings/redirects/redirects.tsx",
  "routes/settings/redirects/redirect-row.tsx",
  "routes/settings/redirects/redirect-drawer.tsx",
  "routes/settings/redirects/redirect-create.tsx",
  "routes/settings/redirects/redirect-edit.tsx",
]

const list = read("routes/settings/redirects/redirects.tsx")
const row = read("routes/settings/redirects/redirect-row.tsx")
const form = read("routes/settings/redirects/redirect-drawer.tsx")

const rule = (id, from, to, status_code = 301) => ({ id, from_path: from, to_path: to, status_code })

// ── the router and the walker ───────────────────────────────────────────────

test("every new address is a child route next to its list and an entry of owner-routes.mjs", () => {
  for (const [path, module] of [
    ["create", "./routes/settings/staff/staff-create"],
    [":id", "./routes/settings/staff/staff-detail"],
    ["edit", "./routes/settings/staff/staff-edit"],
    ["create", "./routes/settings/redirects/redirect-create"],
    [":id/edit", "./routes/settings/redirects/redirect-edit"],
  ]) {
    assert.ok(app.includes(`path: "${path}",`), `app.tsx registers ${path}`)
    assert.ok(app.includes(`"${module}"`), `app.tsx lazy-loads ${module}`)
  }
  const listed = new Map(OWNER_ROUTES.map((route) => [route.path, route]))
  for (const path of [
    "/settings/staff/create",
    "/settings/staff/:staff_id/edit",
    "/settings/redirects/create",
    "/settings/redirects/:redirect_id/edit",
  ]) {
    assert.equal(listed.get(path)?.kind, "overlay", `${path} is an overlay of the walker`)
  }
  assert.ok(listed.has("/settings/staff/:staff_id"), "the staff card is a page of the walker")
  assert.ok(listed.has("/settings/redirects?q=zzzz-nothing-matches"), "the empty search is walked")
  assert.equal(typeof PARAM_RESOLVERS.staff_id, "function")
  assert.equal(typeof PARAM_RESOLVERS.redirect_id, "function")
})

test("the walker opens another person's login, never the developer's, and the caller's own only when alone", async () => {
  const staff = [
    { id: "me", is_self: true, role: "owner" },
    { id: "dev", is_self: false, role: "developer" },
    { id: "vera", is_self: false, role: "operator" },
  ]
  assert.equal(await PARAM_RESOLVERS.staff_id(async () => ({ staff })), "vera")
  assert.equal(await PARAM_RESOLVERS.staff_id(async () => ({ staff: staff.slice(0, 1) })), "me")
  await assert.rejects(PARAM_RESOLVERS.redirect_id(async () => ({ redirects: [] })), /no redirect rules/)
})

test("the staff card carries the person's name as its crumb", () => {
  assert.match(app, /"\.\/routes\/settings\/staff\/staff-detail"[\s\S]{0,200}breadcrumb: \(match: UIMatch\) => <Breadcrumb \{\.\.\.match\} \/>/)
  assert.ok(read("routes/settings/staff/staff-detail/breadcrumb.tsx").includes("staffName(member) || member.email"))
})

// ── «Старые адреса»: the list ───────────────────────────────────────────────

test("the redirect list reads only: no form, no field, no inline edit, no hand-made table", () => {
  for (const forbidden of ["<form", "<Input", "<Select", "useState", "<Table", "mutateAsync"]) {
    assert.ok(!list.includes(forbidden), `the list must not carry ${forbidden}`)
  }
  for (const forbidden of ["<Input", "<Select", "useState", "<Button"]) {
    assert.ok(!row.includes(forbidden), `the row must not carry ${forbidden}`)
  }
  assert.ok(list.includes("<_DataTable") && list.includes("const PAGE_SIZE = 20"))
  assert.ok(list.includes('<Link to="/settings/redirects/create">'), "«Добавить правило» opens the create drawer")
  assert.ok(list.includes("navigateTo={(row) => `/settings/redirects/${row.original.id}/edit${search}`}"), "a row opens its edit drawer")
  assert.ok(list.includes("hasOutlet"), "the drawers open in the list's outlet")
})

test("search, order and page come from the URL; the search field is always there", () => {
  assert.ok(list.includes('useQueryParams(["q", "order", "offset"])'))
  assert.ok(list.includes("<DataTableQuery<TenantRedirect>\n              search"))
  assert.ok(!list.includes("redirects.length > 10"), "the search no longer waits for 11 rules")
})

test("two empty screens: «Правил пока нет» with one button, «Ничего не найдено» with the query and none (E8)", () => {
  const empty = list.slice(list.indexOf("<NoRecords"), list.indexOf("/>", list.indexOf("<NoRecords")))
  assert.ok(empty.includes('t("redirects.emptyTitle")') && empty.includes('t("redirects.emptyMessage")'))
  assert.ok(empty.includes('action={{ to: "/settings/redirects/create", label: t("redirects.addAction") }}'))
  const none = list.slice(list.indexOf("<NoResults"), list.indexOf("/>", list.indexOf("<NoResults")))
  assert.ok(none.includes('t("redirects.noResultsMessage", { query: q?.trim() ?? "" })'))
  assert.ok(!none.includes("action"), "nothing to create from a search")
  // The header's own button is gone while the empty screen offers it.
  assert.ok(list.includes("{hasRules ? (\n            <Link"))
})

test("the row: the old address on one line in monospace, «…» with «Изменить» and, after the separator, «Удалить» behind a prompt", () => {
  assert.ok(row.includes('className="font-mono truncate"'))
  const groups = row.slice(row.indexOf("groups={["), row.indexOf("]}\n    >"))
  assert.ok(groups.indexOf('t("actions.change")') < groups.indexOf('t("actions.delete")'))
  assert.equal((groups.match(/actions: \[/g) ?? []).length, 2, "delete is a group of its own, after the separator")
  assert.ok(row.includes("to: `/settings/redirects/${redirect.id}/edit${search}`"), "the drawer closes back onto the same search")
  assert.match(row, /await prompt\(\{[\s\S]*?variant: "danger"/)
  assert.ok(row.includes('t("redirects.delete.description", {\n        from: redirect.from_path,\n        to: redirect.to_path,'))
  assert.ok(row.includes('aria-label={t("fields.actions")}'))
})

// ── «Старые адреса»: the drawers ────────────────────────────────────────────

test("one route drawer adds and changes a rule; the old address is locked in an edit and says why", () => {
  assert.ok(form.includes("<SettingsEditDrawer<RedirectDraft>"))
  assert.ok(form.includes("disabled={editing}"))
  assert.ok(form.includes('{editing ? t("redirects.fromLocked") : t("redirects.fromHint")}'))
  assert.ok(form.includes('submitText={editing ? undefined : t("redirects.create.submit")}'))
  // An edit sends what it may change; the key of the rule is not among it.
  assert.ok(form.includes("update({ to_path: draft.to_path, status_code: Number(draft.status_code) })"))
  for (const file of ["redirect-create.tsx", "redirect-edit.tsx"]) {
    const route = read(`routes/settings/redirects/${file}`)
    assert.ok(route.includes("<RedirectDrawer") && route.includes("export { "), file)
  }
  assert.ok(read("routes/settings/redirects/redirect-edit.tsx").includes('new FetchError("Redirect rule not found", "Not Found", 404)'))
})

test("the form refuses a path that is not a path and a rule that loops, at the field", () => {
  assert.ok(form.includes('.regex(REDIRECT_PATH_PATTERN, { message: t("redirects.pathError") })'))
  assert.ok(form.includes('message: t("redirects.loopError"),\n        path: ["to_path"],'))
  // The pattern is the backend's (`validators/storefront.ts`, `redirectPath`).
  const backend = readFileSync(
    join(SRC, "..", "..", "backend", "src", "api", "tenants", "validators", "storefront.ts"),
    "utf8"
  )
  assert.ok(backend.includes(`.regex(/${REDIRECT_PATH_PATTERN.source}/,`), "the panel and the backend check the same pattern")
  for (const ok of ["/", "/catalog/kub-1", "/ru/ru/products/myod-lipovyj"]) {
    assert.ok(REDIRECT_PATH_PATTERN.test(ok), ok)
  }
  for (const bad of ["catalog", "/a b", "/a?b=1", "/a#top", "https://shop.ru/a"]) {
    assert.ok(!REDIRECT_PATH_PATTERN.test(bad), bad)
  }
})

// ── the list's search and pages, run for real ───────────────────────────────

test("the search matches either address, without case, and counts what it found", () => {
  const rows = [
    rule("1", "/ru/ru/contact", "/ru/pages/contacts"),
    rule("2", "/ru/en/about", "/en/pages/about"),
    rule("3", "/sale", "/ru/promo", 302),
  ]
  assert.deepEqual(redirectListPage(rows, { limit: 20 }), { rows, count: 3 })
  assert.deepEqual(redirectListPage(rows, { q: " CONTACT ", limit: 20 }).rows.map((r) => r.id), ["1"])
  assert.deepEqual(redirectListPage(rows, { q: "promo", limit: 20 }).rows.map((r) => r.id), ["3"])
  assert.deepEqual(redirectListPage(rows, { q: "kontakty", limit: 20 }), { rows: [], count: 0 })
})

test("the order sorts by either address, both ways; an unknown key keeps the server's order", () => {
  const rows = [rule("1", "/b", "/z"), rule("2", "/a", "/y"), rule("3", "/c", "/x")]
  const ids = (query) => redirectListPage(rows, { limit: 20, ...query }).rows.map((r) => r.id)
  assert.deepEqual(ids({ order: "from_path" }), ["2", "1", "3"])
  assert.deepEqual(ids({ order: "-from_path" }), ["3", "1", "2"])
  assert.deepEqual(ids({ order: "to_path" }), ["3", "2", "1"])
  assert.deepEqual(ids({ order: "status_code" }), ["1", "2", "3"])
  assert.deepEqual(rows.map((r) => r.id), ["1", "2", "3"], "the list from the server is not sorted in place")
})

test("the page is 20 rules from the offset; 52 rules are three pages", () => {
  const rows = Array.from({ length: 52 }, (_, i) => rule(String(i), `/old/${i}`, `/new/${i}`))
  const page = (offset) => redirectListPage(rows, { offset, limit: 20 })
  assert.equal(page(0).rows.length, 20)
  assert.equal(page(0).count, 52)
  assert.equal(page(20).rows[0].id, "20")
  assert.equal(page(40).rows.length, 12)
  assert.equal(page(Number.NaN).rows[0].id, "0", "a broken offset in the URL reads as the first page")
})

// ── words ───────────────────────────────────────────────────────────────────

test("no literal Russian or English string and no English default fallback in the screens' code (rule 7)", () => {
  for (const file of [...STAFF_FILES, ...REDIRECT_FILES]) {
    const code = read(file).replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
    assert.ok(!/["'`>][^"'`<>{}]*[А-Яа-яЁё]{3,}/.test(code), `${file}: no Russian literal`)
    assert.ok(!code.includes("defaultValue:"), `${file}: no default fallback`)
  }
})

test("every i18n key the two screens read exists in ru.json and en.json", () => {
  const keys = new Set(
    [...STAFF_FILES, ...REDIRECT_FILES].flatMap((file) =>
      [...read(file).matchAll(/\bt\("([A-Za-z0-9_.]+)"/g)].map((m) => m[1])
    )
  )
  // Keys built from a value.
  for (const code of [301, 302, 307, 308]) keys.add(`redirects.status.${code}`)
  for (const error of ["emailRequired", "passwordTooShort", "nothingChanged", "general"]) keys.add(`staff.errors.${error}`)
  assert.ok(keys.size > 50, `expected the screens' keys, found ${keys.size}`)
  for (const key of keys) {
    for (const [name, catalog] of [["ru", ru], ["en", en]]) {
      assert.equal(typeof lookup(catalog, key), "string", `${name}.json is missing "${key}"`)
    }
  }
})

test("the prototype's words: the subtitle is a sentence, the prompt names what stays, the empty search names the query", () => {
  assert.equal(ru.redirects.subtitle[0], "К")
  assert.ok(ru.redirects.subtitle.endsWith("."))
  assert.equal(ru.redirects.noResultsTitle, "Ничего не найдено")
  assert.match(ru.redirects.noResultsMessage, /«\{\{query\}\}»/)
  assert.match(ru.staff.delete.description, /^\{\{name\}\} \(\{\{email\}\}\) потеряет доступ/)
  assert.match(ru.staff.delete.description, /останутся\.$/)
  assert.equal(ru.staff.create.submit, "Добавить")
  assert.equal(ru.redirects.create.submit, "Добавить")
  // The words the edit used to say in its own cells are gone with the cells.
  for (const gone of ["counter", "empty", "deleteConfirm", "saveAction", "cancel", "searchPlaceholder"]) {
    assert.equal(ru.redirects[gone], undefined, `redirects.${gone}`)
    assert.equal(en.redirects[gone], undefined, `redirects.${gone}`)
  }
})
