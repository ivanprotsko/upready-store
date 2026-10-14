import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * «Оформление → Иконка приложения» (t-2026-10-03-61). The screen is JSX this
 * package cannot render (no vitest/jsdom, see `error-boundary-auth.test.mjs`),
 * so this asserts on the source: every `brandingSettings.*` key the screen
 * reads exists in both catalogs, the icon set travels with the favicon into
 * the PUT, and removing the favicon clears the set rather than leaving the old
 * icons behind it.
 *
 * t-2026-10-14-01 (panel redesign, G1 part 4): the icon section has its own
 * drawer (`icons-edit.tsx`); the preview is shared by the page and the drawer.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const read = (path) => readFileSync(join(SRC, path), "utf8")

const FILES = [
  "branding.tsx",
  "app-icons.tsx",
  "upload-slot.tsx",
  "branding-file.tsx",
  "header-preview.tsx",
  "color-input.tsx",
  "logo-edit.tsx",
  "icons-edit.tsx",
  "color-edit.tsx",
  "use-branding-edit.ts",
]
const screen = FILES.map((file) => read(`routes/settings/branding/${file}`)).join("\n")

const catalogs = {
  ru: JSON.parse(read("i18n/translations/ru.json")),
  en: JSON.parse(read("i18n/translations/en.json")),
}

const lookup = (catalog, key) => key.split(".").reduce((node, part) => node?.[part], catalog)

test("every brandingSettings key the screen reads has a ru and an en string", () => {
  const keys = [...new Set([...screen.matchAll(/t\("(brandingSettings\.[A-Za-z.]+)"/g)].map((match) => match[1]))]

  assert.ok(keys.length > 50, `expected the whole screen's keys, found ${keys.length}`)
  for (const [lang, catalog] of Object.entries(catalogs)) {
    for (const key of keys) {
      assert.equal(typeof lookup(catalog, key), "string", `${lang}.json has no string at ${key}`)
    }
  }
})

test("no string of the screen is a defaultValue fallback: the catalogs are the only source (rule 7)", () => {
  assert.ok(!screen.includes("defaultValue:"), "a defaultValue is a literal on screen when a key goes missing")
})

test("the icon set is saved with the favicon and cleared with it", () => {
  const drawer = read("routes/settings/branding/icons-edit.tsx")
  const hook = read("routes/settings/branding/use-branding-edit.ts")

  assert.match(hook, /put\(\{ favicon_url: values\.favicon_url, app_icons: values\.app_icons \}\)/, "the PUT must carry the set with the favicon")
  assert.match(
    drawer,
    /url && built \? \{ \.\.\.EMPTY_APP_ICONS, \.\.\.built \} : null/,
    "a favicon upload replaces the set; removing the favicon clears it"
  )
  assert.match(drawer, /kind="favicon"/, "the favicon has its slot in the icon drawer")
})

test("the two optional masters appear only once a favicon built a set, and only patch it", () => {
  const drawer = read("routes/settings/branding/icons-edit.tsx")

  for (const kind of ["favicon_maskable", "favicon_mono"]) {
    assert.ok(drawer.includes(`"${kind}"`), `no upload slot for ${kind}`)
  }
  const master = drawer.slice(drawer.indexOf("const master ="), drawer.indexOf("return (", drawer.indexOf("const master =")))
  assert.ok(master.includes("{icons ? ("), "a master slot must wait for the set")
  assert.ok(master.includes('t("brandingSettings.appIcons.needsFavicon")'), "without a set the owner reads why")
  assert.ok(master.includes("removable={false}"), "a master is replaced, never removed")
  assert.match(drawer, /form\.setValue\("app_icons", \{ \.\.\.current, \.\.\.fields \}/, "a master patches the set that is there")
  assert.match(drawer, /formats=\{formats\}/)
  assert.match(drawer, /\["image\/svg\+xml"\]/, "the silhouette takes SVG only")
})

test("the preview shows the tab, iOS and Android on the page and in the drawer", () => {
  const preview = read("routes/settings/branding/app-icons.tsx")
  for (const key of ["previewTab", "previewIos", "previewAndroid"]) {
    assert.ok(preview.includes(`t("brandingSettings.appIcons.${key}")`), `the ${key} frame`)
  }
  assert.ok(read("routes/settings/branding/branding.tsx").includes("<AppIconsPreview"), "the page row «Как выглядит»")
  assert.ok(read("routes/settings/branding/icons-edit.tsx").includes("<AppIconsPreview"), "the live preview in the drawer")
})
