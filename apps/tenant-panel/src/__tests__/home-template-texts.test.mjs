import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  channelsOf,
  draftOf,
  fieldLabelKeys,
  isLongText,
  isSectionOwn,
  isText,
  channelRefusal,
  lengthRefusal,
  overridesWithTexts,
  textRows,
  refusalsOf,
  sectionOverrides,
  textsOf,
  withChannel,
  withText,
} from "../routes/home-settings/section-texts.ts"

// t-2026-10-12-33 PE2: the texts of a template's sections in the panel's «Шаблоны». The owner replaces the words
// of every editable section; the apply sends them as `overrides.sections`; applying the live template again
// carries the shop's saved words over; a refusal of the backend lands at its field.

const CATALOGUE = JSON.parse(
  readFileSync(new URL("../../../backend/src/api/tenants/home/template/catalog.generated.json", import.meta.url), "utf8"),
)
const RU = JSON.parse(readFileSync(new URL("../i18n/translations/ru.json", import.meta.url), "utf8"))
const EN = JSON.parse(readFileSync(new URL("../i18n/translations/en.json", import.meta.url), "utf8"))
const LOCALES = CATALOGUE.locales
const BLOCKS = new Map(CATALOGUE.blocks.map((block) => [block.id, block]))

/** A template as `GET /tenants/home/templates` gives its card. */
const cardOf = (id) => {
  const manifest = CATALOGUE.templates[id]
  return {
    id,
    title: manifest.title,
    description: manifest.description,
    defaultMode: manifest.settings.defaultMode,
    theme: manifest.theme,
    sections: manifest.sections.map((section) => ({
      block: section.block,
      category: BLOCKS.get(section.block).category,
      ...(section.props ? { props: section.props } : {}),
      editable: BLOCKS.get(section.block).propsEditable,
    })),
  }
}

const uhod = cardOf("uhod")
const REVIEWS = uhod.sections.findIndex((section) => section.block === "testimonials/cards")
const SIGNUP = uhod.sections.findIndex((section) => section.block === "newsletter/signup")
const clone = (value) => JSON.parse(JSON.stringify(value))
const savedOf = (card, draft) => ({
  id: card.id,
  palette: card.theme.palette,
  layers: null,
  fontPair: card.theme.fontPair,
  sections: card.sections.map((section, index) => ({
    block: section.block,
    category: section.category,
    ...(draft[index] ? { props: draft[index] } : {}),
  })),
})

/* ------------------------------------------------------------------ texts found */

test("a text is an object of the catalogue's language codes to strings, nothing else", () => {
  assert.equal(isText({ ru: "Отзывы", en: "Reviews" }, LOCALES), true)
  assert.equal(isText({ ru: "" }, LOCALES), true)
  assert.equal(isText({}, LOCALES), false)
  assert.equal(isText({ ru: "Отзывы", href: "/store" }, LOCALES), false)
  assert.equal(isText({ ru: 3 }, LOCALES), false)
  assert.equal(isText(["ru"], LOCALES), false)
  assert.equal(isText("Отзывы", LOCALES), false)
})

test("the texts of a section are found depth first, each with its path and its leaf name", () => {
  const texts = textsOf(uhod.sections[REVIEWS].props, LOCALES)
  assert.deepEqual(
    texts.map((text) => text.path),
    [
      "header.heading",
      "items[0].quote",
      "items[0].name",
      "items[0].city",
      "items[1].quote",
      "items[1].name",
      "items[1].city",
      "items[2].quote",
      "items[2].name",
      "items[2].city",
    ],
  )
  assert.deepEqual(texts[0], {
    path: "header.heading",
    leaf: "heading",
    parent: "header",
    numbers: [],
    text: uhod.sections[REVIEWS].props.header.heading,
  })
  assert.deepEqual(texts[7].numbers, [3])
  assert.equal(texts[7].leaf, "quote")
  // A text standing in a list itself, as the facts of hero/split: the list's name is its leaf.
  const facts = textsOf({ facts: [{ ru: "а", en: "a" }, { ru: "б", en: "b" }] }, LOCALES)
  assert.deepEqual(
    facts.map(({ path, leaf, parent, numbers }) => ({ path, leaf, parent, numbers })),
    [
      { path: "facts[0]", leaf: "facts", parent: null, numbers: [1] },
      { path: "facts[1]", leaf: "facts", parent: null, numbers: [2] },
    ],
  )
})

test("links, images, numbers and the channels are not texts", () => {
  const signup = textsOf(uhod.sections[SIGNUP].props, LOCALES)
  assert.deepEqual(
    signup.map((text) => text.path),
    ["heading", "text"],
  )
  const hero = uhod.sections.find((section) => section.block === "hero/split")
  for (const text of textsOf(hero.props, LOCALES)) {
    assert.ok(!/href|src|image\.(src|width|height)/.test(text.path), text.path)
  }
})

/* ------------------------------------------------------------------ written back */

test("an edited text goes back at its path, and everything else stays as it was", () => {
  const props = uhod.sections[REVIEWS].props
  const before = clone(props)
  const edited = withText(props, "items[1].quote", "ru", "Мой собственный отзыв.")
  assert.equal(edited.items[1].quote.ru, "Мой собственный отзыв.")
  assert.equal(edited.items[1].quote.en, props.items[1].quote.en)
  // The source is not touched, and nothing but that line changed.
  assert.deepEqual(props, before)
  const back = clone(edited)
  back.items[1].quote.ru = props.items[1].quote.ru
  assert.deepEqual(back, props)
  // A heading under a nested object, and a text in a list of texts.
  assert.equal(withText(props, "header.heading", "en", "What they say").header.heading.en, "What they say")
  assert.equal(withText({ facts: [{ ru: "а" }, { ru: "б" }] }, "facts[1]", "ru", "в").facts[1].ru, "в")
})

test("an edit never adds or removes a list item, an image or a link", () => {
  const hero = uhod.sections.find((section) => section.block === "hero/split").props
  let props = hero
  for (const text of textsOf(hero, LOCALES)) {
    for (const lang of Object.keys(text.text)) props = withText(props, text.path, lang, `${lang}: ${text.path}`)
  }
  const strip = (value) =>
    JSON.stringify(value, (key, inner) => (isText(inner, LOCALES) ? Object.keys(inner).sort() : inner))
  assert.equal(strip(props), strip(hero))
})

/* ------------------------------------------------------------------ the newsletter's channels */

test("the signup's channels are fields of their own, an empty address keeps a channel hidden", () => {
  const props = uhod.sections[SIGNUP].props
  assert.deepEqual(channelsOf("newsletter/signup", props), [
    { index: 0, network: "telegram", href: null },
    { index: 1, network: "vk", href: null },
    { index: 2, network: "max", href: null },
  ])
  assert.deepEqual(channelsOf("testimonials/cards", uhod.sections[REVIEWS].props), [])
  const linked = withChannel(props, 0, "  https://t.me/uhod_shop ")
  assert.equal(linked.channels[0].href, "https://t.me/uhod_shop")
  assert.equal(linked.channels[0].network, "telegram")
  assert.equal(props.channels[0].href, null)
  assert.equal(withChannel(linked, 0, "  ").channels[0].href, null)
  assert.deepEqual(channelsOf("newsletter/signup", linked)[0], { index: 0, network: "telegram", href: "https://t.me/uhod_shop" })
})

/* ------------------------------------------------------------------ overrides */

test("a template applied with its own words sends no section overrides", () => {
  const draft = draftOf(uhod, null).draft
  assert.deepEqual(sectionOverrides(uhod, draft), [])
  const choice = { palette: uhod.theme.palette, layers: { ...uhod.theme } }
  assert.equal(overridesWithTexts(uhod, choice, draft), undefined)
  assert.equal(isSectionOwn(uhod, REVIEWS, draft), true)
})

test("an edited section goes as one override with its whole props, next to the palette", () => {
  const draft = draftOf(uhod, null).draft
  draft[REVIEWS] = withText(draft[REVIEWS], "header.heading", "ru", "Что говорят наши покупатели")
  draft[REVIEWS] = withText(draft[REVIEWS], "items[0].quote", "ru", "Мой отзыв.")
  draft[SIGNUP] = withChannel(draft[SIGNUP], 0, "https://t.me/uhod_shop")
  assert.equal(isSectionOwn(uhod, REVIEWS, draft), false)
  const sections = sectionOverrides(uhod, draft)
  assert.deepEqual(
    sections.map(({ index, block }) => ({ index, block })),
    [
      { index: REVIEWS, block: "testimonials/cards" },
      { index: SIGNUP, block: "newsletter/signup" },
    ],
  )
  assert.equal(sections[0].props.items[0].quote.ru, "Мой отзыв.")
  assert.equal(sections[0].props.items.length, uhod.sections[REVIEWS].props.items.length)

  const choice = { palette: "ferma", layers: { ...uhod.theme } }
  assert.deepEqual(Object.keys(overridesWithTexts(uhod, choice, draft)).sort(), ["palette", "sections"])
  assert.equal(overridesWithTexts(uhod, choice, draft).palette, "ferma")
})

test("a section that is not editable never goes as an override", () => {
  const locked = { ...uhod, sections: uhod.sections.map((section, index) => (index === REVIEWS ? { ...section, editable: false } : section)) }
  const draft = draftOf(locked, null).draft
  draft[REVIEWS] = withText(draft[REVIEWS], "header.heading", "ru", "Другое")
  assert.deepEqual(sectionOverrides(locked, draft), [])
})

/* ------------------------------------------------------------------ carrying the owner's words over */

test("the live template opens on the shop's saved words, and applying it again sends them back", () => {
  const own = draftOf(uhod, null).draft
  own[REVIEWS] = withText(own[REVIEWS], "items[0].quote", "ru", "Мой отзыв.")
  const current = savedOf(uhod, own)

  const { draft, dropped } = draftOf(uhod, current)
  assert.deepEqual(dropped, [])
  assert.equal(draft[REVIEWS].items[0].quote.ru, "Мой отзыв.")
  // Only the palette changes: the saved words still go, so the storefront keeps them.
  const overrides = overridesWithTexts(uhod, { palette: "ferma", layers: { ...uhod.theme } }, draft)
  assert.equal(overrides.palette, "ferma")
  assert.deepEqual(overrides.sections, [{ index: REVIEWS, block: "testimonials/cards", props: draft[REVIEWS] }])
  // Another template opens on its own words, whatever the shop saved.
  const lending = cardOf("lending")
  assert.deepEqual(draftOf(lending, current).draft, lending.sections.map((section) => section.props))
})

test("saved words whose section moved are named before applying and not sent", () => {
  const own = draftOf(uhod, null).draft
  own[REVIEWS] = withText(own[REVIEWS], "items[0].quote", "ru", "Мой отзыв.")
  const current = savedOf(uhod, own)
  // A storefront update put another block where the reviews stood.
  const faq = { block: "faq/accordion", category: "faq", props: { items: [] }, editable: true }
  const replaced = { ...uhod, sections: uhod.sections.map((section, index) => (index === REVIEWS ? faq : section)) }
  const { draft, dropped } = draftOf(replaced, current)
  assert.deepEqual(dropped, [{ index: REVIEWS, block: "testimonials/cards", category: "testimonials" }])
  assert.deepEqual(draft[REVIEWS], { items: [] })
  assert.deepEqual(sectionOverrides(replaced, draft), [])

  // An update put a section in front: every index moved. The sections that held the template's own words lose
  // nothing of the owner's, so only the edited reviews are named.
  const bar = { block: "announcement/text-bar", category: "announcement", props: { text: { ru: "а", en: "a" } }, editable: true }
  const shifted = { ...uhod, sections: [bar, ...uhod.sections] }
  const moved = draftOf(shifted, current)
  assert.deepEqual(moved.dropped, [{ index: REVIEWS, block: "testimonials/cards", category: "testimonials" }])
  assert.deepEqual(sectionOverrides(shifted, moved.draft), [])
})

/* ------------------------------------------------------------------ the editor's fields */

test("long texts take a text area, short ones a single line", () => {
  const texts = textsOf(uhod.sections[REVIEWS].props, LOCALES)
  assert.equal(isLongText(texts.find((text) => text.leaf === "quote")), true)
  assert.equal(isLongText(texts.find((text) => text.leaf === "name")), false)
  assert.equal(isLongText({ leaf: "heading", text: { ru: "х".repeat(91) } }), true)
  for (const leaf of ["quote", "answer", "text", "lead", "note", "paragraphs"]) {
    assert.equal(isLongText({ leaf, text: { ru: "" } }), true, leaf)
  }
  // A text area is as tall as its longest language needs, three to eight rows.
  assert.equal(textRows({ text: { ru: "коротко", en: "short" } }), 3)
  assert.equal(textRows({ text: { ru: "х".repeat(297), en: "x".repeat(200) } }), 6)
  assert.equal(textRows({ text: { ru: "х".repeat(5000) } }), 8)
})

const lookup = (dictionary, key) => key.split(".").reduce((node, part) => (node == null ? node : node[part]), dictionary)
const fieldLabel = (dictionary, text) =>
  fieldLabelKeys(text)
    .map((key) => lookup(dictionary, `homeSettings.templates.texts.${key}`))
    .find((label) => typeof label === "string" && label.trim())

test("every text of every catalogue template has a field name in plain words, in Russian and in English", () => {
  const missing = []
  for (const [id, manifest] of Object.entries(CATALOGUE.templates)) {
    manifest.sections.forEach((section, index) => {
      for (const text of textsOf(section.props, LOCALES)) {
        for (const [code, dictionary] of [["ru", RU], ["en", EN]]) {
          if (!fieldLabel(dictionary, text)) missing.push(`${code}: ${id} sections[${index}] ${section.block} ${text.path}`)
        }
      }
    })
  }
  assert.deepEqual(missing, [])
})

test("a refined field name wins over the leaf's own, and the leaf's own stands for the rest", () => {
  const seeAll = { path: "header.seeAll.label", leaf: "label", parent: "seeAll", numbers: [], text: { ru: "" } }
  assert.deepEqual(fieldLabelKeys(seeAll), ["fieldsIn.seeAll.label", "fields.label"])
  assert.deepEqual(fieldLabelKeys({ path: "facts[0]", leaf: "facts", parent: null, numbers: [1], text: {} }), ["fields.facts"])
  assert.match(fieldLabel(RU, seeAll), /[а-яё]/i)
  assert.notEqual(fieldLabel(RU, seeAll), fieldLabel(RU, { ...seeAll, parent: "primary" }))
})

test("every block category has a plain name for the section's title, in Russian and in English", () => {
  const categories = [...new Set(CATALOGUE.blocks.map((block) => block.category))]
  for (const category of categories) {
    assert.ok(lookup(RU, `homeSettings.templates.categories.${category}`)?.trim(), `ru: ${category}`)
    assert.ok(lookup(EN, `homeSettings.templates.categories.${category}`)?.trim(), `en: ${category}`)
  }
})

/* ------------------------------------------------------------------ a refusal at its field */

test("the backend's 400 is split into refusals by section and field", () => {
  const message =
    "sections[6].props: items[0].quote.ru is 5000 characters, at most 400 sections[7].props: channels[0].href must lead to a channel on t.me or telegram.me for telegram"
  assert.deepEqual(refusalsOf(message), {
    sections: [
      { index: 6, field: "items[0].quote.ru", message: "items[0].quote.ru is 5000 characters, at most 400" },
      { index: 7, field: "channels[0].href", message: "channels[0].href must lead to a channel on t.me or telegram.me for telegram" },
    ],
    rest: "",
  })
  assert.deepEqual(refusalsOf("items[1].name.xx: not a language of i18n/config.ts").sections, [])
  assert.deepEqual(refusalsOf("sections[2].props: items[1].name.xx: not a language of i18n/config.ts").sections, [
    { index: 2, field: "items[1].name.xx", message: "items[1].name.xx: not a language of i18n/config.ts" },
  ])
  // A refusal of no section stays whole, for the toast.
  assert.deepEqual(refusalsOf("overrides.sections[0].block: section 6 of uhod is testimonials/cards, not faq/accordion."), {
    sections: [],
    rest: "overrides.sections[0].block: section 6 of uhod is testimonials/cards, not faq/accordion.",
  })
})

test("a length refusal is read as the length and its limit, anything else is not", () => {
  assert.deepEqual(lengthRefusal("items[0].quote.ru is 5000 characters, at most 400"), { now: 5000, max: 400 })
  assert.equal(lengthRefusal("channels[0].href must lead to a channel on t.me or telegram.me for telegram"), null)
  assert.equal(lengthRefusal("items has 9 items, at most 8"), null)
})

test("a channel off its network is read as the network's hosts, anything else is not", () => {
  assert.deepEqual(channelRefusal("channels[1].href must lead to a channel on vk.com or vk.ru for vk"), ["vk.com", "vk.ru"])
  assert.deepEqual(channelRefusal("channels[2].href must lead to a channel on max.ru for max"), ["max.ru"])
  assert.equal(channelRefusal("channels[0].href must start with / or https://"), null)
})
