import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * t-2026-10-14-01 (panel redesign, stage 3, G1): the two shared pieces every
 * settings screen is now built from — `SettingsDetail` (the read page, design
 * system E2/E11/E13) and `SettingsEditDrawer` (the nested `…/edit` route, E3,
 * E5, E9) — and the four small screens rebuilt on them. This package cannot
 * render JSX (no vitest/jsdom, the note every panel test here carries, see
 * `error-boundary-auth.test.mjs`), so the contract is asserted on the source.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const read = (path) => readFileSync(join(SRC, path), "utf8")

const detail = read("components/settings/settings-detail/settings-detail.tsx")
const drawer = read("components/settings/settings-edit-drawer/settings-edit-drawer.tsx")
const app = read("app.tsx")
const ru = JSON.parse(read("i18n/translations/ru.json"))
const en = JSON.parse(read("i18n/translations/en.json"))

const SCREENS = ["locale", "customer-login", "seo", "analytics"]
const readPage = (name) => read(`routes/settings/${name}/${name}.tsx`)
const editPage = (name) => read(`routes/settings/${name}/${name}-edit/${name}-edit.tsx`)

const lookup = (catalog, key) =>
  key.split(".").reduce((node, part) => (node == null ? node : node[part]), catalog)

// ── SettingsDetail ──────────────────────────────────────────────────────────

test("SettingsDetail only reads: no form, no input, no save button on the page", () => {
  for (const forbidden of ["<form", "<Input", "<Textarea", "<Select", "actions.save", "type=\"submit\""]) {
    assert.ok(!detail.includes(forbidden), `the read page must not carry ${forbidden}`)
  }
})

test("a section is a Container with its header and SectionRow rows", () => {
  assert.ok(detail.includes('<Container className="divide-y p-0"'), "a section is a divided Container")
  assert.ok(detail.includes('className="flex items-center justify-between gap-x-4 px-6 py-4"'), "the header is the Medusa px-6 py-4 row")
  assert.ok(detail.includes("<Heading level={level}>"), "the title is a Heading")
  assert.ok(detail.includes("<SectionRow"), "rows are SectionRow, the panel's one row primitive")
})

test("the first section's title is the screen's own h1, the others h2 (E11)", () => {
  assert.ok(detail.includes('level={index === 0 ? "h1" : "h2"}'))
})

test("each section opens its nested edit route from «…» → «Изменить», default `edit`", () => {
  assert.ok(detail.includes('label: t("actions.change")'), "the menu item reads «Изменить»")
  assert.ok(detail.includes('to: section.editTo ?? "edit"'), "the item links to the section's nested route")
  assert.equal(ru.actions.change, "Изменить")
})

test("the «…» icon button has an accessible name (DS «Запрещено»: icon button without aria-label)", () => {
  assert.ok(detail.includes('aria-label={t("fields.actions")}'))
})

test("the page renders the outlet, so the drawer of the nested route can open over it", () => {
  assert.ok(detail.includes("hasOutlet"), "SingleColumnPage must keep its outlet for the …/edit child")
})

test("until the first answer the page is a skeleton, not empty rows (rule 12)", () => {
  assert.ok(detail.includes("if (isPending)"))
  assert.ok(detail.includes("<SingleColumnPageSkeleton"))
})

test("an empty value reads «—» unless the row is only a status badge (rule 19)", () => {
  assert.ok(detail.includes("const empty = isEmpty(row.value) && !row.status"))
  assert.ok(detail.includes("—"), "the dash itself")
})

test("states are StatusBadge, in the section header and in a row (E7)", () => {
  assert.equal((detail.match(/<StatusBadge color=/g) ?? []).length, 2)
})

// ── SettingsEditDrawer ──────────────────────────────────────────────────────

test("the edit drawer is RouteDrawer + RouteDrawer.Form + KeyboundForm, like Medusa's region-edit", () => {
  for (const piece of ["<RouteDrawer>", "<RouteDrawer.Form form={form}>", "<KeyboundForm", "<RouteDrawer.Footer>"]) {
    assert.ok(drawer.includes(piece), `missing ${piece}`)
  }
  assert.ok(drawer.includes("zodResolver(schema)"), "the form validates with the screen's zod schema")
  assert.ok(drawer.includes("<RouteDrawer.Title asChild>"), "the dialog has a Title (DS «Запрещено»)")
})

test("one «Отмена / Сохранить» pair, in the footer, and nowhere else (E5, rule 2)", () => {
  assert.equal((drawer.match(/t\("actions\.save"\)/g) ?? []).length, 1)
  assert.equal((drawer.match(/t\("actions\.cancel"\)/g) ?? []).length, 1)
  const footer = drawer.slice(drawer.indexOf("<RouteDrawer.Footer>"), drawer.indexOf("</RouteDrawer.Footer>"))
  assert.ok(footer.includes("<RouteDrawer.Close asChild>"), "«Отмена» closes the drawer")
  assert.ok(footer.includes('type="submit"'), "«Сохранить» submits the form")
})

test("a save toasts success, then returns to the read page; a refusal toasts the platform's message and stays", () => {
  const submit = drawer.slice(drawer.indexOf("form.handleSubmit"), drawer.indexOf("return (", drawer.indexOf("form.handleSubmit")))
  const errorAt = submit.indexOf("toast.error(error instanceof Error ? error.message")
  const returnAt = submit.indexOf("return", errorAt)
  const successAt = submit.indexOf("toast.success(typeof successMessage")
  const closeAt = submit.indexOf("handleSuccess()")
  assert.ok(errorAt !== -1, "a refusal must reach the owner as toast.error with the platform's text")
  assert.ok(returnAt !== -1 && returnAt < successAt, "a refusal must not fall through to the success toast")
  assert.ok(successAt !== -1 && closeAt > successAt, "success: toast first, then back to the read page")
})

test("the success toast may read the save's answer (G2: values a save cleared)", () => {
  assert.ok(drawer.includes("successMessage: string | ((result: unknown) => string)"))
  assert.ok(drawer.includes("result = await onSubmit(values)"))
  assert.ok(drawer.includes('typeof successMessage === "function" ? successMessage(result) : successMessage'))
})

test("the submit says «Сохранить» unless a create drawer names its own word (G2: «Добавить»)", () => {
  assert.ok(drawer.includes("submitText?: string"))
  assert.ok(drawer.includes('{submitText ?? t("actions.save")}'))
})

test("a status badge takes the platform developer's purple as well (G2, the staff card)", () => {
  assert.ok(detail.includes('color: "green" | "grey" | "orange" | "red" | "blue" | "purple"'))
})

test("the form mounts only once the saved record is read, never with blanks", () => {
  assert.ok(drawer.includes("{isPending ? null : <SettingsEditForm {...form} />}"))
})

// ── the four G1 screens ─────────────────────────────────────────────────────

test("each G1 screen is a SettingsDetail read page with no form of its own", () => {
  for (const name of SCREENS) {
    const page = readPage(name)
    assert.ok(page.includes("<SettingsDetail"), `${name}: the read page must be SettingsDetail`)
    for (const forbidden of ["<form", "mutateAsync", "toast.", "<Input", "<RadioGroup", "<Combobox"]) {
      assert.ok(!page.includes(forbidden), `${name}: the read page must not carry ${forbidden}`)
    }
  }
})

test("each G1 screen edits in a SettingsEditDrawer on its nested `edit` route", () => {
  for (const name of SCREENS) {
    assert.ok(editPage(name).includes("<SettingsEditDrawer"), `${name}-edit must use SettingsEditDrawer`)
    // «Счётчики» keeps its drawer route in `routes.ts` beside the screen, so that app.tsx stays within its length.
    const routesModule = join(SRC, "routes", "settings", name, "routes.ts")
    const registered = existsSync(routesModule) ? readFileSync(routesModule, "utf8") : ""
    assert.ok(
      app.includes(`lazy: () => import("./routes/settings/${name}/${name}-edit"),`) ||
        registered.includes(`lazy: () => import("./${name}-edit"),`),
      `${name}: app.tsx must register the edit drawer as a child route`
    )
  }
})

test("every i18n key the G1 screens read literally exists in ru.json and en.json", () => {
  const files = [detail, drawer, ...SCREENS.flatMap((name) => [readPage(name), editPage(name)])]
  const keys = new Set(files.flatMap((source) => [...source.matchAll(/\bt\("([A-Za-z0-9_.]+)"/g)].map((m) => m[1])))
  assert.ok(keys.size > 30, `expected the screens' keys, found ${keys.size}`)
  for (const key of keys) {
    for (const [name, catalog] of [["ru", ru], ["en", en]]) {
      const value = lookup(catalog, key) ?? lookup(catalog, `${key}_other`)
      assert.equal(typeof value, "string", `${name}.json is missing "${key}"`)
    }
  }
})

test("no English fallback is left in the G1 screens (rule 7)", () => {
  for (const name of SCREENS) {
    for (const source of [readPage(name), editPage(name)]) {
      assert.ok(!source.includes("defaultValue:"), `${name}: a defaultValue fallback is a literal on screen`)
      assert.ok(!/Enable at least one language/.test(source))
    }
  }
  assert.equal(ru.localeSettings.needsOneLocale, "Включите хотя бы один язык.")
})

test("«Счётчики» lives in one key, so Ivan's answer to question 2 is a one-line change", () => {
  assert.equal(ru.analyticsSettings.title, "Счётчики")
  assert.ok(app.includes('breadcrumb: () => t("analyticsSettings.title")'))
  assert.ok(readPage("analytics").includes('title: t("analyticsSettings.title")'))
  assert.ok(editPage("analytics").includes('title={t("analyticsSettings.title")}'))
  for (const name of SCREENS) {
    for (const source of [readPage(name), editPage(name)]) {
      assert.ok(!/["'`>]Счётчики/.test(source), `${name}: the title must come from the key, not a literal`)
    }
  }
})

test("the language hint counts what is left of the 36, in Russian plural forms", () => {
  for (const form of ["zero", "one", "few", "many", "other"]) {
    assert.equal(typeof ru.localeSettings[`enabledLocalesHint_${form}`], "string", `ru plural form ${form}`)
  }
  assert.ok(readPage("locale").includes("count: LOCALE_CODES.length - doc.enabled_locales.length"))
})
