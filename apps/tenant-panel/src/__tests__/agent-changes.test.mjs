import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  CONFIRMED_ACTIONS,
  changesetActions,
  changesetKindLabel,
  changesetWhat,
  changesetWhen,
  categoryIdsOf,
  fieldLabel,
  formatFieldValue,
  formatValue,
  siteLink,
} from "../routes/agent-changes/labels.ts"

/**
 * «Изменения агента» (t-2026-10-27-04). `labels.ts` is plain TS, so it runs for
 * real against the RU catalogue; the screens are read as text. What it pins
 * down: each status offers only the moves the server accepts, publishing and
 * rolling back ask first, a drifted changeset cannot be rolled back from the
 * card, every key the section uses exists in both languages, and the section
 * is wired into the router, the menu, the permissions and the routes manifest.
 */

const src = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
const ru = JSON.parse(src("i18n/translations/ru.json"))
const en = JSON.parse(src("i18n/translations/en.json"))

const lookup = (catalogue, key) => key.split(".").reduce((node, part) => node?.[part], catalogue)
const PLURAL = new Intl.PluralRules("ru")
const t = (key, options = {}) => {
  const plural = typeof options.count === "number" ? lookup(ru, `${key}_${PLURAL.select(options.count)}`) : undefined
  const value = plural ?? lookup(ru, key)
  if (typeof value !== "string") return key
  return value.replace(/{{(\w+)}}/g, (_, name) => String(options[name]))
}

const SECTION = [
  "routes/agent-changes/labels.ts",
  "routes/agent-changes/use-changeset-actions.tsx",
  "routes/agent-changes/changeset-list/changeset-list.tsx",
  "routes/agent-changes/changeset-list/use-changeset-table.tsx",
  "routes/agent-changes/changeset-detail/changeset-detail.tsx",
]

test("each status offers only the moves the server accepts, the main one first", () => {
  assert.deepEqual(changesetActions("draft"), ["stage", "discard"])
  assert.deepEqual(changesetActions("staged"), ["publish", "discard"])
  assert.deepEqual(changesetActions("published"), ["rollback"])
  assert.deepEqual(changesetActions("rolled_back"), [])
  assert.deepEqual(changesetActions("discarded"), [])
})

test("publishing, rolling back and discarding ask first; showing on stage does not", () => {
  assert.deepEqual([...CONFIRMED_ACTIONS].sort(), ["discard", "publish", "rollback"])
  const actions = src("routes/agent-changes/use-changeset-actions.tsx")
  assert.match(actions, /CONFIRMED_ACTIONS\.includes\(move\)/)
  assert.match(actions, /await prompt\(/)
  assert.match(actions, /if \(!confirmed\) return/)
})

test("a drifted changeset keeps «Откатить» off in the card and says why", () => {
  const detail = src("routes/agent-changes/changeset-detail/changeset-detail.tsx")
  assert.match(detail, /move === "rollback" && drifted/)
  assert.match(detail, /data-testid="agent-change-drift"/)
  assert.match(src("routes/agent-changes/use-changeset-actions.tsx"), /status === 409 && move === "rollback"/)
})

test("values read as words: empty, flags, long JSON cut short", () => {
  assert.equal(formatValue(t, null), "пусто")
  assert.equal(formatValue(t, ""), "пусто")
  assert.equal(formatValue(t, true), "да")
  assert.equal(formatValue(t, false), "нет")
  assert.equal(formatValue(t, "Чайник"), "Чайник")
  assert.equal(formatValue(t, 1290), "1290")
  const long = formatValue(t, { text: "x".repeat(400) })
  assert.equal(long.length, 160)
  assert.ok(long.endsWith("…"))
})

test("prices, photos and categories read as money, a count and names, not JSON", () => {
  const before = formatFieldValue(t, "prices", [{ amount: 690, currency_code: "rub" }])
  const after = formatFieldValue(t, "prices", [{ amount: 750, currency_code: "rub" }])
  assert.match(before, /690/)
  assert.match(after, /750/)
  for (const text of [before, after]) {
    assert.doesNotMatch(text, /[{}"]|amount|currency_code/)
    assert.match(text, /₽|RUB/)
  }
  assert.equal(formatFieldValue(t, "prices", []), "пусто")

  assert.equal(formatFieldValue(t, "images", [{ url: "a" }, { url: "b" }, { url: "c" }]), "3 фото")
  assert.equal(formatFieldValue(t, "images", [{ url: "a" }]), "1 фото")
  assert.equal(formatFieldValue(t, "images", []), "без фото")

  const names = new Map([["pcat_tea", "Чай"], ["pcat_ware", "Посуда"]])
  assert.equal(formatFieldValue(t, "categories", [{ id: "pcat_tea" }, { id: "pcat_ware" }], names), "Чай, Посуда")
  assert.equal(formatFieldValue(t, "categories", [{ id: "pcat_gone" }], names), "pcat_gone")
  assert.equal(formatFieldValue(t, "categories", []), "без категорий")
  assert.equal(formatFieldValue(t, "title", "Улун"), "Улун")

  assert.deepEqual(
    categoryIdsOf([
      { field: "categories", before: [{ id: "pcat_tea" }], after: [{ id: "pcat_tea" }, { id: "pcat_ware" }] },
      { field: "title", before: "a", after: "b" },
    ]),
    ["pcat_tea", "pcat_ware"]
  )
})

test("the card shows the panel's skeleton while it loads", () => {
  const detail = src("routes/agent-changes/changeset-detail/changeset-detail.tsx")
  assert.match(detail, /isPending \|\| !changeset \? \(/)
  assert.match(detail, /<GeneralSectionSkeleton rowCount=\{4\} \/>/)
})

test("labels: kinds, fields, what and when", () => {
  assert.equal(changesetKindLabel(t, "home"), "Главная")
  assert.equal(changesetKindLabel(t, null), "Недоступное действие")
  assert.equal(fieldLabel(t, "title"), "Название")
  assert.equal(fieldLabel(t, "weird_key"), "weird_key")
  assert.equal(changesetWhat(t, { summary: "  ", op_kinds: ["home", "product"] }), "Главная, Товар")
  assert.equal(changesetWhat(t, { summary: "Новый баннер", op_kinds: ["home"] }), "Новый баннер")
  const row = { status: "published", created_at: "c", staged_at: "s", published_at: "p", rolled_back_at: null, discarded_at: null }
  assert.equal(changesetWhen(row), "p")
  assert.equal(changesetWhen({ ...row, status: "draft" }), "c")
  assert.equal(changesetWhen({ ...row, status: "rolled_back" }), "c")
})

test("site links join the site and the path, or are absent", () => {
  assert.equal(siteLink("https://stage.shop.test/", "/products/kettle"), "https://stage.shop.test/products/kettle")
  assert.equal(siteLink("https://shop.test", "about"), "https://shop.test/about")
  assert.equal(siteLink(null, "/about"), null)
  assert.equal(siteLink("https://shop.test", null), null)
})

test("every agentChanges key the section uses exists in RU and EN", () => {
  const keys = new Set()
  for (const file of SECTION) {
    for (const [, key] of src(file).matchAll(/["`](agentChanges\.[\w.-]+)["`]/g)) keys.add(key)
  }
  // Template keys: each status, source, kind, action and confirmation.
  const statuses = ["draft", "staged", "published", "rolled_back", "discarded"]
  for (const s of statuses) keys.add(`agentChanges.status.${s}`).add(`agentChanges.statusHint.${s}`)
  for (const s of ["owner-voice", "telegram", "panel"]) keys.add(`agentChanges.source.${s}`)
  for (const k of ["home", "branding", "page-create", "page", "article-create", "article", "product", "variant", "attributes", "denied"]) {
    keys.add(`agentChanges.kind.${k}`)
  }
  for (const a of ["open", "stage", "publish", "rollback", "discard"]) keys.add(`agentChanges.actions.${a}`)
  for (const a of ["stage", "publish", "rollback", "discard"]) keys.add(`agentChanges.toasts.${a}`)
  for (const k of ["noPhotos", "noCategories"]) keys.add(`agentChanges.diff.${k}`)
  for (const a of CONFIRMED_ACTIONS) keys.add(`agentChanges.confirm.${a}.title`).add(`agentChanges.confirm.${a}.description`)
  // A plural key lives as its forms; they are checked just below.
  keys.delete("agentChanges.detail.ops")
  keys.delete("agentChanges.diff.photos")
  assert.ok(keys.size > 50)
  for (const key of keys) {
    assert.equal(typeof lookup(ru, key), "string", `ru: ${key}`)
    assert.equal(typeof lookup(en, key), "string", `en: ${key}`)
  }
  for (const form of ["one", "few", "many", "other"]) assert.ok(ru.agentChanges.detail[`ops_${form}`])
  for (const form of ["one", "other"]) assert.ok(en.agentChanges.detail[`ops_${form}`])
  for (const form of ["one", "few", "many", "other"]) assert.ok(ru.agentChanges.diff[`photos_${form}`])
  for (const form of ["one", "other"]) assert.ok(en.agentChanges.diff[`photos_${form}`])
  assert.equal(ru.app.nav.owner.agentChanges, "Изменения агента")
  assert.equal(en.app.nav.owner.agentChanges, "Agent changes")
})

test("the section is routed, in the menu, gated and in the routes manifest", () => {
  const app = src("app.tsx")
  assert.match(app, /path: "\/agent-changes"/)
  assert.match(app, /children: agentChangesChildren,/)
  assert.match(src("routes/agent-changes/routes.tsx"), /import\("\.\/changeset-detail"\)/)
  assert.match(src("components/layout/owner-nav/nav-model.ts"), /"app\.nav\.owner\.agentChanges", to: "\/agent-changes"/)
  assert.match(src("lib/permissions.ts"), /\["\/agent-changes", "storefront"\]/)
  const manifest = readFileSync(new URL("../../e2e/owner-routes.mjs", import.meta.url), "utf8")
  assert.match(manifest, /path: "\/agent-changes"/)
  assert.match(manifest, /path: "\/agent-changes\/:changeset_id", kind: "overlay"/)
})
