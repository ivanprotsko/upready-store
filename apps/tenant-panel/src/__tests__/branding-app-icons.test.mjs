import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * «Бренд → Иконка приложения» (t-2026-10-03-61). The screen is JSX this
 * package cannot render (no vitest/jsdom, see `error-boundary-auth.test.mjs`),
 * so this asserts on the source: every `brandingSettings.*` key the screen
 * reads exists in both catalogs, the icon set travels with the favicon into
 * the PUT, and removing the favicon clears the set rather than leaving the old
 * icons behind it.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const read = (path) => readFileSync(join(SRC, path), "utf8")

const screen = ["branding.tsx", "app-icons.tsx", "upload-slot.tsx"]
  .map((file) => read(`routes/settings/branding/${file}`))
  .join("\n")

const catalogs = {
  ru: JSON.parse(read("i18n/translations/ru.json")),
  en: JSON.parse(read("i18n/translations/en.json")),
}

const lookup = (catalog, key) => key.split(".").reduce((node, part) => node?.[part], catalog)

test("every brandingSettings key the screen reads has a ru and an en string", () => {
  const keys = [...new Set([...screen.matchAll(/t\("(brandingSettings\.[A-Za-z.]+)"/g)].map((match) => match[1]))]

  assert.ok(keys.length > 20, `expected the whole screen's keys, found ${keys.length}`)
  for (const [lang, catalog] of Object.entries(catalogs)) {
    for (const key of keys) {
      assert.equal(typeof lookup(catalog, key), "string", `${lang}.json has no string at ${key}`)
    }
  }
})

test("the Russian catalog says exactly what the code's own defaults say", () => {
  for (const match of screen.matchAll(/t\("(brandingSettings\.[A-Za-z.]+)",\s*\{\s*defaultValue:\s*"((?:[^"\\]|\\.)*)"/g)) {
    assert.equal(lookup(catalogs.ru, match[1]), match[2], `ru.json ${match[1]} differs from its defaultValue`)
  }
})

test("the icon set is saved with the favicon and cleared with it", () => {
  const branding = read("routes/settings/branding/branding.tsx")

  assert.match(branding, /app_icons: draft\.app_icons,/, "the PUT must carry the draft's app_icons")
  assert.match(
    branding,
    /app_icons: url && icons \? \{ \.\.\.EMPTY_APP_ICONS, \.\.\.icons \} : null/,
    "a favicon upload replaces the set; removing the favicon clears it"
  )
  assert.match(branding, /onChange=\{updateFavicon\}/, "the favicon slot must go through updateFavicon")
})

test("the two optional masters stay disabled until a favicon built a set", () => {
  const appIcons = read("routes/settings/branding/app-icons.tsx")

  for (const kind of ["favicon_maskable", "favicon_mono"]) {
    const start = appIcons.indexOf(`kind="${kind}"`)
    assert.notEqual(start, -1, `no upload slot for ${kind}`)
    const slot = appIcons.slice(start, appIcons.indexOf("/>", start))
    assert.ok(slot.includes("disabled={!icons}"), `${kind} must be disabled without a set`)
  }
})
