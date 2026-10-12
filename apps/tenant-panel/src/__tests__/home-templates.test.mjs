import { test } from "node:test"
import assert from "node:assert/strict"

import {
  failureText,
  initialChoice,
  isTemplateOwn,
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
