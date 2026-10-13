import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"

import { THEME_LABELS, THEME_PRESETS } from "../routes/home-settings/composition.ts"
import {
  densityGapPx,
  failureText,
  initialChoice,
  isTemplateOwn,
  orderTemplates,
  overridesFrom,
  paletteAllowed,
  previewHref,
  swatchFor,
  templateChoice,
  textFor,
} from "../routes/home-settings/templates.ts"

// t-2026-10-12-33 P2: the «Шаблоны» section of /home-settings. The controls make the body
// of `POST /tenants/home/template`: the overrides are only what differs from the template,
// the reset returns to the template's own values, a light-only palette is offered only to a
// light template, and a refused apply shows the server's own words.

const swatch = { background: "#fff", foreground: "#111", primary: "#a64b2a", accent: "#eee", muted: "#f5f5f5" }

const longMorning = {
  id: "long-morning",
  title: "Long Morning",
  description: "Home goods, light and unhurried.",
  defaultMode: "light",
  theme: {
    palette: "home-goods",
    fontPair: { display: "Cormorant Garamond", body: "Manrope" },
    radius: "soft",
    buttonStyle: "filled",
    photoStyle: "landscape",
    density: "spacious",
  },
  sections: [{ block: "hero/h", category: "hero" }],
}

const ferrite = {
  ...longMorning,
  id: "ferrite",
  defaultMode: "dark",
  theme: { ...longMorning.theme, palette: "electronics", radius: "sharp" },
}

const ferma = { id: "ferma", label: "Ferma", lightOnly: true, colours: { light: swatch } }
const homeGoods = { id: "home-goods", label: "Long Morning", lightOnly: false, colours: { light: swatch, dark: { ...swatch, background: "#1a1512" } } }

test("a template applied as it is sends no overrides", () => {
  assert.equal(overridesFrom(longMorning, templateChoice(longMorning)), undefined)
  assert.equal(isTemplateOwn(longMorning, templateChoice(longMorning)), true)
})

test("the overrides carry only the palette and the layers the owner changed", () => {
  const choice = templateChoice(longMorning)
  const changed = { palette: "ferma", layers: { ...choice.layers, radius: "pill", density: "compact" } }
  assert.deepEqual(overridesFrom(longMorning, changed), { palette: "ferma", layers: { radius: "pill", density: "compact" } })
  assert.deepEqual(overridesFrom(longMorning, { ...choice, layers: { ...choice.layers, buttonStyle: "outlined" } }), {
    layers: { buttonStyle: "outlined" },
  })
  assert.equal(isTemplateOwn(longMorning, changed), false)
})

test("the reset returns to the template's own values, whatever the shop saved", () => {
  const current = {
    id: "long-morning",
    palette: "ferma",
    layers: { radius: "pill", buttonStyle: "outlined", photoStyle: "square", density: "compact" },
    fontPair: longMorning.theme.fontPair,
  }
  // The saved template opens on what the storefront shows now…
  assert.deepEqual(initialChoice(longMorning, current), { palette: "ferma", layers: current.layers })
  // …another template on its own values, and the reset is the template's own values.
  assert.deepEqual(initialChoice(ferrite, current), templateChoice(ferrite))
  assert.deepEqual(templateChoice(longMorning), {
    palette: "home-goods",
    layers: { radius: "soft", buttonStyle: "filled", photoStyle: "landscape", density: "spacious" },
  })
  assert.equal(overridesFrom(longMorning, templateChoice(longMorning)), undefined)
})

test("a light-only palette is offered to a light template only", () => {
  assert.equal(paletteAllowed(longMorning, ferma), true)
  assert.equal(paletteAllowed(ferrite, ferma), false)
  assert.equal(paletteAllowed(ferrite, homeGoods), true)
})

test("the schematic is painted in the template's own mode, light where the palette has no dark", () => {
  assert.equal(swatchFor(homeGoods, "dark").background, "#1a1512")
  assert.equal(swatchFor(homeGoods, "light").background, "#fff")
  assert.equal(swatchFor(ferma, "dark").background, "#fff")
})

test("a refused apply shows the server's own words, a forbidden pair's reason included", () => {
  const forbidden = Object.assign(new Error("The shelf hero needs a header with a search."), { status: 422 })
  assert.equal(failureText(forbidden, "The template could not be applied."), "The shelf hero needs a header with a search.")
  assert.equal(failureText(new Error(""), "The template could not be applied."), "The template could not be applied.")
  assert.equal(failureText("network", "The template could not be applied."), "The template could not be applied.")
})

test("the preview link exists only with a preview origin", () => {
  assert.equal(previewHref(undefined, "ru", "long-morning"), null)
  assert.equal(previewHref("", "ru", "long-morning"), null)
  assert.equal(previewHref("https://preview.example/", "ru", "long-morning"), "https://preview.example/ru?template=long-morning")
})

// P2b: the catalogue's words come per language; the section shows the owner's.
test("a catalogue text is read in the panel's language, else English, else any line given", () => {
  const title = { ru: "Долгое утро", en: "Long Morning" }
  assert.equal(textFor(title, "ru"), "Долгое утро")
  assert.equal(textFor(title, "ru-RU"), "Долгое утро")
  assert.equal(textFor(title, "en"), "Long Morning")
  assert.equal(textFor(title, "de"), "Long Morning")
  assert.equal(textFor({ ru: "Стандартная" }, "en"), "Стандартная")
  assert.equal(textFor({ ru: " ", en: "Medusa default" }, "ru"), "Medusa default")
})

test("a catalogue text that is a string is the same words in every language", () => {
  assert.equal(textFor("Long Morning", "ru"), "Long Morning")
  assert.equal(textFor("Long Morning", undefined), "Long Morning")
  assert.equal(textFor({ en: "Long Morning" }, undefined), "Long Morning")
})

// The schematic's gaps between sections follow the storefront's density steps (#389): the catalogue export carries
// the storefront's section gap per density, and the scheme draws it at an eighth, so the ratio stays the storefront's.
test("the schematic's gap between sections keeps the storefront's proportion at every density", () => {
  const catalogue = JSON.parse(
    readFileSync(new URL("../../../backend/src/api/tenants/home/template/catalog.generated.json", import.meta.url), "utf8"),
  )
  const { sectionGapPx } = catalogue
  assert.deepEqual(sectionGapPx, { compact: 32, comfortable: 48, spacious: 64 })
  const gaps = catalogue.layers.density.map((density) => densityGapPx(sectionGapPx, density))
  assert.deepEqual(gaps, [4, 6, 8])
  for (const density of catalogue.layers.density) {
    assert.equal(densityGapPx(sectionGapPx, density) / sectionGapPx[density], 1 / 8, density)
  }
})

// P2c: the cards' order is the panel's, not the file's. The export keys `templates` by id, so
// `Object.values()` gives ferrite before long-morning whatever the owner reads.
const uhod = { ...longMorning, id: "uhod", title: { ru: "Косметика и уход", en: "Cosmetics and Care" } }
const translated = [
  { ...ferrite, title: { ru: "Феррит", en: "Ferrite" } },
  { ...longMorning, title: { ru: "Долгое утро", en: "Long Morning" } },
  uhod,
]
const ids = (list) => list.map((template) => template.id)
const live = (id) => ({ id, palette: "home-goods", layers: null, fontPair: longMorning.theme.fontPair })

test("the template on the storefront comes first, the rest by their title in the panel's language", () => {
  assert.deepEqual(ids(orderTemplates(translated, live("uhod"), "ru")), ["uhod", "long-morning", "ferrite"])
  assert.deepEqual(ids(orderTemplates(translated, live("uhod"), "en")), ["uhod", "ferrite", "long-morning"])
  assert.deepEqual(ids(orderTemplates(translated, live("ferrite"), "ru-RU")), ["ferrite", "long-morning", "uhod"])
})

test("with no template on the storefront every card goes by its title", () => {
  assert.deepEqual(ids(orderTemplates(translated, null, "ru")), ["long-morning", "uhod", "ferrite"])
  assert.deepEqual(ids(orderTemplates(translated, null, "en")), ["uhod", "ferrite", "long-morning"])
  // A template the catalogue no longer has puts no card first.
  assert.deepEqual(ids(orderTemplates(translated, live("gone"), "ru")), ["long-morning", "uhod", "ferrite"])
})

test("the order does not follow the catalogue's layout and leaves the catalogue's list as it was", () => {
  const reversed = [...translated].reverse()
  assert.deepEqual(ids(orderTemplates(reversed, live("uhod"), "ru")), ["uhod", "long-morning", "ferrite"])
  assert.deepEqual(ids(reversed), ["uhod", "long-morning", "ferrite"])
  assert.deepEqual(ids(orderTemplates(translated, null, "ru")), ids(orderTemplates(reversed, null, "ru")))
  assert.deepEqual(ids(translated), ["ferrite", "long-morning", "uhod"])
})

test("a title given as one string sorts by that string, and a language that is not a tag does not break the order", () => {
  const untranslated = { ...longMorning, id: "draft", title: "Black Friday" }
  assert.deepEqual(ids(orderTemplates([...translated, untranslated], null, "en")), [
    "draft",
    "uhod",
    "ferrite",
    "long-morning",
  ])
  assert.deepEqual(ids(orderTemplates(translated, null, "not a language")), ["uhod", "ferrite", "long-morning"])
})

// P2c: the «Тема» section names the palette in the owner's language. The panel cannot import
// the storefront, so it keeps a hand copy; this holds the copy to `THEME_LABEL_TEXTS`.
const PRESETS_FILE = new URL("../../../storefront/src/lib/theme/presets.generated.ts", import.meta.url)

function generatedLabelTexts() {
  const source = readFileSync(PRESETS_FILE, "utf8")
  const literal = source.match(/export const THEME_LABEL_TEXTS: [^=]+= (\{[\s\S]*?\n\})/)
  assert.ok(literal, "THEME_LABEL_TEXTS is in presets.generated.ts")
  return runInNewContext(`(${literal[1]})`)
}

test("the «Тема» copy has the words of the storefront's THEME_LABEL_TEXTS for each of its palettes", () => {
  const generated = generatedLabelTexts()
  for (const preset of THEME_PRESETS) {
    assert.deepEqual({ ...THEME_LABELS[preset] }, { ...generated[preset] }, preset)
  }
  assert.deepEqual(Object.keys(THEME_LABELS).sort(), [...THEME_PRESETS].sort())
})

test("the «Тема» palettes read Russian in a Russian panel and English in an English one", () => {
  assert.equal(textFor(THEME_LABELS["home-goods"], "ru"), "Терракота")
  assert.equal(textFor(THEME_LABELS["home-goods"], "en"), "Long Morning")
  assert.equal(textFor(THEME_LABELS.medusa, "ru-RU"), "Стандартная")
  for (const preset of THEME_PRESETS) {
    assert.match(textFor(THEME_LABELS[preset], "ru"), /^[А-яЁё -]+$/, preset)
  }
})
