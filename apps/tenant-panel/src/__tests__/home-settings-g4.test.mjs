import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  BLOCK_SLOTS,
  DEFAULT_DOCUMENT,
  FORBIDDEN,
  HOME_BLOCKS,
  IMAGE_HEROES,
  SLOT_VALUES,
  THEME_PRESETS,
  blockedReason,
  heroShowsImage,
} from "../routes/home-settings/composition.ts"

/**
 * t-2026-10-14-01 (panel redesign, stage 3, G4): `/home-settings` rebuilt
 * after the prototype on `SettingsDetail` and seven `SettingsEditDrawer`s on
 * nested routes. Ivan 14.10 about the old screen: «почему не спрятали поля».
 * This package cannot render JSX (no vitest/jsdom, see
 * `settings-detail-edit-drawer.test.mjs`), so the contract is asserted on the
 * source.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const read = (path) => readFileSync(join(SRC, path), "utf8")
const home = (file) => read(`routes/home-settings/${file}`)

const page = home("home-settings.tsx")
const hook = home("use-home-edit.ts")
const routes = home("routes.ts")
const list = home("components/home-banners-list.tsx")
const imageField = home("components/image-field.tsx")
const app = read("app.tsx")
const ownerRoutes = readFileSync(join(SRC, "..", "e2e", "owner-routes.mjs"), "utf8")
const ru = JSON.parse(read("i18n/translations/ru.json"))
const en = JSON.parse(read("i18n/translations/en.json"))

// Prototype state → nested route → the drawer's module.
const DRAWERS = {
  "theme/edit": "home-theme-edit.tsx",
  "blocks/edit": "home-blocks-edit.tsx",
  "hero/edit": "home-hero-edit.tsx",
  "banners/create": "home-banner-create.tsx",
  "banners/:bannerId/edit": "home-banner-edit.tsx",
  "products/edit": "home-products-edit.tsx",
  "order/edit": "home-order-edit.tsx",
}

const FILES = readdirSync(join(SRC, "routes/home-settings"), { recursive: true })
  .filter((file) => /\.(tsx?|mjs)$/.test(file))
  .map((file) => file.replaceAll("\\", "/"))

const lookup = (catalog, key) => key.split(".").reduce((node, part) => node?.[part], catalog)

// ── the read page ───────────────────────────────────────────────────────────

test("the page only reads: a SettingsDetail, no field, no Save, no spinner (Ivan: «почему не спрятали поля»)", () => {
  assert.ok(page.includes("<SettingsDetail isPending={isPending} sections={sections} />"))
  for (const forbidden of [
    "<form", "<Input", "<Textarea", "<Select", "<Switch", "<Combobox", "type=\"file\"", "actions.save",
    "home-settings-save", "Spinner", "useUpdateTenantHome", "toLocaleString",
  ]) {
    assert.ok(!page.includes(forbidden), `the read page must not carry ${forbidden}`)
  }
})

test("six sections in the prototype's order, each opening its own drawer", () => {
  const order = ["theme", "blocks", "hero", "banners", "products", "order"].map((id) => page.indexOf(`id: "${id}",`))
  assert.ok(order.every((at) => at !== -1), "six sections")
  assert.deepEqual([...order].sort((a, b) => a - b), order)
  for (const route of ["theme/edit", "blocks/edit", "hero/edit", "products/edit", "order/edit"]) {
    assert.ok(page.includes(`editTo: "${route}"`), `a section opens ${route}`)
  }
})

test("the first section carries the screen's title and the last save, through getFullDate (rule 14)", () => {
  assert.ok(page.includes('title: t("homeSettings.title")'))
  assert.equal(ru.homeSettings.title, ru.app.nav.main.homeSettings, "the title is the menu item")
  assert.ok(page.includes("getFullDate({ date: saved.updatedAt, includeTime: true })"))
  assert.ok(page.includes('t("homeSettings.neverSaved")'), "an unsaved page says so")
})

test("«Блоки» lists the five slots, each with its variant and the line under it", () => {
  assert.deepEqual([...BLOCK_SLOTS], ["header", "hero", "tiles", "listing", "footer"])
  assert.ok(page.includes("value: option(slot, settings[slot])") && page.includes("hint: why(slot, settings[slot])"))
})

test("the default mode sits in «Тема», not in «Блоки» (lead's decision)", () => {
  const theme = page.slice(page.indexOf('id: "theme",'), page.indexOf('id: "blocks",'))
  assert.ok(theme.includes('id: "defaultMode"'))
  assert.ok(!BLOCK_SLOTS.includes("defaultMode"))
  assert.ok(home("home-theme-edit.tsx").includes('name="defaultMode"'))
  assert.ok(!home("home-blocks-edit.tsx").includes("defaultMode:"), "the blocks drawer does not send the mode")
})

test("the banners: rows that open their drawer, «…» with move and delete behind usePrompt, an empty state", () => {
  assert.ok(page.includes("body: <HomeBannersList banners={banners} save={save} />"))
  assert.ok(page.includes("actions: [],"), "no «…» on the section: its one action is «Добавить баннер»")
  assert.ok(list.includes("to={editTo(banner)}"), "the row opens its drawer (rule 9)")
  assert.ok(list.includes("`banners/${encodeURIComponent(banner.id)}/edit`"))
  assert.ok(list.includes('aria-label={t("fields.actions")}'), "«…» has a name")
  assert.ok(list.includes("const confirmed = await prompt({"), "a removal asks first (rule 8)")
  assert.ok(list.indexOf("if (confirmed)") > list.indexOf("await prompt({"))
  assert.ok(list.includes("destructive: true"), "delete is the last, destructive group")
  assert.ok(list.includes("<NoRecords"), "no banners → NoRecords with one button (E8)")
  assert.ok(list.includes('action={{ to: "banners/create", label: t("homeSettings.banners.add") }}'))
  assert.ok(list.includes("count >= BANNERS_MAX"), "«Добавить баннер» is off at ten")
  assert.ok(list.includes('{ id: productIds, fields: "id,title", limit: BANNERS_MAX }'), "a product banner names its product")
})

test("the order section numbers the shown blocks and names the hidden ones", () => {
  assert.ok(page.includes('data-testid={`home-order-${block}`}'))
  assert.ok(page.includes('t("homeSettings.order.hiddenLine"') && page.includes('t("homeSettings.order.hiddenNone")'))
})

// ── the drawers ─────────────────────────────────────────────────────────────

test("every drawer is a lazy route child of /home-settings, registered without growing app.tsx", () => {
  assert.ok(app.includes('import { homeSettingsChildren } from "./routes/home-settings/routes"'))
  assert.ok(app.includes("children: homeSettingsChildren,"))
  assert.ok(app.split("\n").length - 1 <= 1480, "app.tsx stays at its recorded 1480 lines")
  for (const [route, file] of Object.entries(DRAWERS)) {
    const name = file.replace(".tsx", "")
    assert.ok(
      routes.includes(`path: "${route}",\n    lazy: () => import("./${name}"),`),
      `routes.ts registers ${route}`
    )
    assert.ok(/export (\{ \w+ as Component \}|const Component =)/.test(home(file)), `${file} is a lazy route module`)
  }
})

test("every drawer route has its overlay row in the owner route manifest (DS rule 16)", () => {
  for (const route of Object.keys(DRAWERS)) {
    const path = `/home-settings/${route.replace(":bannerId", ":banner_id")}`
    assert.ok(ownerRoutes.includes(`{ path: "${path}", kind: "overlay" },`), `owner-routes.mjs: ${path}`)
  }
  assert.ok(ownerRoutes.includes('const body = await api("/tenants/home")'), "the walker resolves :banner_id")
})

test("each drawer is a SettingsEditDrawer that saves through the one document hook and ends in one toast", () => {
  for (const file of Object.values(DRAWERS).filter((file) => file !== "home-banner-create.tsx")) {
    const source = home(file)
    assert.ok(source.includes("<SettingsEditDrawer"), `${file}: SettingsEditDrawer`)
    assert.ok(source.includes("useHomeDocument()"), `${file}: the document hook`)
    assert.ok(source.includes("successMessage={"), `${file}: one success toast (E9)`)
    assert.ok(!source.includes("mutateAsync") && !source.includes("toast."), `${file}: no save or toast of its own`)
  }
  assert.ok(hook.includes("mutateAsync({ theme: next.theme, settings: next.settings, content: next.content })"), "today's PUT, whole")
  assert.ok(hook.includes("const next = edit(doc)"), "the drawer edits the saved copy")
})

test("each drawer changes only its own part of the document", () => {
  const owns = {
    "home-theme-edit.tsx": ["theme: { ...current.theme, preset: values.preset }", "settings: { ...current.settings, defaultMode: values.defaultMode }"],
    "home-blocks-edit.tsx": ["settings: { ...current.settings, ...values }"],
    "home-hero-edit.tsx": ["hero: {\n              ...current.content.hero,"],
    "home-products-edit.tsx": ["products:\n              values.source === \"category\""],
    "home-order-edit.tsx": ["content: { ...current.content, order: values.order }"],
    "home-banner-edit.tsx": ["content: { ...current.content, banners: next }"],
  }
  for (const [file, parts] of Object.entries(owns)) {
    for (const part of parts) {
      assert.ok(home(file).includes(part), `${file} sends ${part.split("\n")[0]}`)
    }
  }
})

test("the blocks and theme drawers grey a forbidden pair and say why; zod refuses it too", () => {
  const blocks = home("home-blocks-edit.tsx")
  assert.ok(blocks.includes("disabled={blocked.some((entry) => entry.value === item)}"))
  assert.ok(blocks.includes('t("homeSettings.unavailable", {'))
  assert.ok(blocks.includes("const live = { ...doc.settings, ...form.watch() }"), "the pair is checked against the choices in the drawer")
  const theme = home("home-theme-edit.tsx")
  assert.ok(theme.includes('blockedReason(doc.settings, "defaultMode", mode)'))
  for (const source of [blocks, theme]) {
    assert.ok(source.includes("ctx.addIssue({ code: \"custom\""), "zod refuses the pair")
  }
})

test("the first screen offers the picture only to the variants that show it", () => {
  const hero = home("home-hero-edit.tsx")
  assert.ok(hero.includes("{heroShowsImage(variant) ? ("))
  assert.ok(hero.includes('t("homeSettings.hero.imageUnused", {'))
  assert.ok(hero.includes("...current.content.hero,"), "the hero's other languages ride along")
})

test("the banner drawer: picture, description, four corners, what it opens, the live preview", () => {
  const banner = home("home-banner-edit.tsx")
  for (const name of ["image_src", "alt", "kicker", "label", "title", "button", "link_type", "product_id", "href"]) {
    assert.ok(banner.includes(`name="${name}"`), `field ${name}`)
  }
  assert.ok(banner.includes("<BannerCard src={live.image_src} texts={live} />"), "the preview follows the fields")
  assert.ok(banner.includes("isAllowedBannerHref(values.href.trim())"), "the backend's href rule")
  assert.ok(banner.includes('t("homeSettings.banners.imageRequired")'))
  assert.ok(banner.includes('submitText={stored ? undefined : t("actions.add")}'), "a new banner is «Добавить»")
  assert.ok(banner.includes('<Navigate to="/home-settings" replace />'), "a gone banner or an eleventh leads back")
  assert.ok(banner.includes("...stored,"), "a stored banner keeps its other languages")
  assert.ok(home("home-banner-create.tsx").includes("<HomeBannerEdit create />"))
})

test("the order drawer drags with SortableList and hides with a switch; one block always stays", () => {
  const order = home("home-order-edit.tsx")
  assert.ok(order.includes("<SortableList") && order.includes("<SortableList.DragHandle />"))
  assert.ok(order.includes("<Switch") && order.includes("aria-label={t(\"homeSettings.order.show\", { block: name })}"))
  assert.ok(order.includes("disabled={order.length === 1}"))
  assert.ok(order.includes("onChange([...order, block])"), "a block switched on goes last")
})

test("an upload in flight blocks «Сохранить» with a toast instead of losing the picture", () => {
  assert.ok(hook.includes('Promise.reject(new Error(t("homeSettings.image.stillUploading")))'))
  for (const file of ["home-hero-edit.tsx", "home-banner-edit.tsx"]) {
    assert.ok(home(file).includes("uploads.guard("), `${file} guards its save`)
    assert.ok(home(file).includes("onUploadingChange={uploads.track}"), `${file} reports its uploads`)
  }
})

// ── design system ───────────────────────────────────────────────────────────

test("no native file input and no typed picture address: FileUpload to POST /tenants/uploads", () => {
  for (const file of FILES) {
    assert.ok(!home(file).includes('type="file"'), `${file}: a native file input`)
  }
  assert.ok(imageField.includes("<FileUpload") && imageField.includes("multiple={false}"))
  assert.ok(imageField.includes("await uploadTenantFile(picked.file)"))
  assert.ok(hook.includes('"/tenants/uploads"'))
})

test("no literal Russian string and no default fallback in the screen's code (DS rules 6–7)", () => {
  for (const file of FILES) {
    const source = home(file)
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
    assert.ok(!/["'`>][^"'`<>{}]*[А-Яа-яЁё]{3,}/.test(code), `${file}: a Russian literal in code`)
    assert.ok(!source.includes("defaultValue:"), `${file}: a defaultValue fallback`)
  }
})

test("no inline style on the panel's own controls (DS «Запрещено»)", () => {
  for (const file of FILES) {
    assert.ok(!home(file).includes("style={{"), `${file}: an inline style`)
  }
})

// ── catalogs ────────────────────────────────────────────────────────────────

test("every i18n key the screen reads literally exists in ru.json and en.json", () => {
  const keys = new Set(FILES.flatMap((file) => [...home(file).matchAll(/\bt\("([A-Za-z0-9_.]+)"/g)].map((m) => m[1])))
  assert.ok(keys.size > 40, `only ${keys.size} keys found`)
  for (const key of keys) {
    for (const [name, catalog] of [["ru", ru], ["en", en]]) {
      assert.equal(typeof lookup(catalog, key), "string", `${name}.json: ${key}`)
    }
  }
})

test("every value of every slot, palette, block and forbidden pair has its words in both catalogs", () => {
  for (const [name, catalog] of [["ru", ru], ["en", en]]) {
    const words = catalog.homeSettings
    for (const [slot, values] of Object.entries(SLOT_VALUES)) {
      assert.equal(typeof words.slots[slot], "string", `${name}: slots.${slot}`)
      for (const value of values) {
        assert.equal(typeof words.options[slot]?.[value], "string", `${name}: options.${slot}.${value}`)
        assert.equal(typeof words.why[slot]?.[value], "string", `${name}: why.${slot}.${value}`)
      }
    }
    for (const preset of THEME_PRESETS) assert.equal(typeof words.palettes[preset], "string", `${name}: palettes.${preset}`)
    for (const block of HOME_BLOCKS) assert.equal(typeof words.order.blocks[block], "string", `${name}: order.blocks.${block}`)
    for (const rule of FORBIDDEN) assert.equal(typeof words.forbidden[rule.reason], "string", `${name}: forbidden.${rule.reason}`)
  }
})

test("the ru and en home catalogs have the same keys", () => {
  const keys = (node, prefix = "") =>
    Object.entries(node).flatMap(([key, value]) =>
      typeof value === "object" ? keys(value, `${prefix}${key}.`) : [`${prefix}${key}`]
    )
  assert.deepEqual(keys(ru.homeSettings).sort(), keys(en.homeSettings).sort())
})

test("the owner reads «первый экран», never «хиро»", () => {
  assert.ok(!/хиро/i.test(JSON.stringify(ru.homeSettings)))
})

// ── the vocabulary ──────────────────────────────────────────────────────────

test("a forbidden pair is blocked from both sides", () => {
  const base = DEFAULT_DOCUMENT.settings
  assert.equal(blockedReason({ ...base, hero: "k" }, "header", "h4"), "headerAccentHeroAnnounce")
  assert.equal(blockedReason({ ...base, header: "h4" }, "hero", "k"), "headerAccentHeroAnnounce")
  assert.equal(blockedReason({ ...base, defaultMode: "dark" }, "footer", "f6"), "footerInvertedDark")
  assert.equal(blockedReason({ ...base, footer: "f6" }, "defaultMode", "dark"), "footerInvertedDark")
  assert.equal(blockedReason(base, "header", "h4"), null)
})

test("the picture is offered to Витрина, Анонс and В движении only", () => {
  assert.deepEqual(IMAGE_HEROES, ["g", "k", "l"])
  assert.equal(heroShowsImage("none"), false)
  assert.equal(heroShowsImage("h"), false)
  assert.equal(heroShowsImage("k"), true)
})
