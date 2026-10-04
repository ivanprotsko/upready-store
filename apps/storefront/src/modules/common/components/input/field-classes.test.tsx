import { readFileSync } from "node:fs"
import { join } from "node:path"
import { NextIntlClientProvider } from "next-intl"
import { createElement, type ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import Input from "@modules/common/components/input"
import NativeSelect from "@modules/common/components/native-select"
import SuggestInput from "@modules/common/components/suggest-input"

import { FIELD_FOCUS, FIELD_FOCUS_WITHIN, FIELD_SURFACE } from "./field-classes"

const messages = JSON.parse(readFileSync(join(__dirname, "../../../../../messages/ru.json"), "utf8"))

const render = (element: ReactElement) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="ru" messages={messages}>
      {element}
    </NextIntlClientProvider>
  )

/** The class list of the first element in `html` that matches `tag`. */
const classesOf = (html: string, tag: RegExp) => {
  const match = html.match(tag)
  expect(match, `no ${tag} in ${html}`).not.toBeNull()
  return (match![1] ?? "").split(/\s+/)
}

const words = (classes: string) => classes.split(/\s+/)

/**
 * Ivan, 04.10 (ask-20261004-090510-c687): «нужно привести поля к стилю medusjs ui и убрать этот
 * зеленый оттенок в полях». Each field the storefront draws itself paints Medusa UI's field: the
 * field surface, a `shadow-borders-base` hairline instead of a border in the preset's colour, and
 * the neutral focus ring instead of the 2px ring in the shop's brand colour (`--ring`).
 */
describe("the storefront's own fields", () => {
  const cases: [string, () => string, RegExp, string[]][] = [
    [
      "Input",
      () => render(createElement(Input, { label: "Адрес", name: "address_1", required: true })),
      /<input[^>]*class="([^"]*)"/,
      [...words(FIELD_SURFACE), ...words(FIELD_FOCUS)],
    ],
    [
      "SuggestInput",
      () =>
        render(
          createElement(SuggestInput<string>, {
            label: "Город",
            value: "",
            onValueChange: () => undefined,
            onPick: () => undefined,
            fetchItems: async () => [],
            itemKey: (item) => item,
            itemLabel: (item) => item,
          })
        ),
      /<input[^>]*class="([^"]*)"/,
      [...words(FIELD_SURFACE), ...words(FIELD_FOCUS)],
    ],
    [
      "NativeSelect, the form field",
      () => render(createElement(NativeSelect, { variant: "field", placeholder: "Область" })),
      /<div class="([^"]*)"><select/,
      [...words(FIELD_SURFACE), ...words(FIELD_FOCUS_WITHIN)],
    ],
    [
      "NativeSelect, the compact picker",
      () => render(createElement(NativeSelect, { placeholder: "Сортировка" })),
      /<div class="([^"]*)"><select/,
      [...words(FIELD_SURFACE), ...words(FIELD_FOCUS_WITHIN)],
    ],
  ]

  it.each(cases)("%s paints Medusa UI's field with the neutral focus ring", (_name, html, tag, expected) => {
    const classes = classesOf(html(), tag)
    for (const name of expected) expect(classes).toContain(name)
  })

  it.each(cases)("%s draws no border in the preset's colour and no ring in the brand colour", (_name, html) => {
    const markup = html()
    expect(markup).not.toContain("border-ui-border-base")
    expect(markup).not.toContain("ring-[var(--ring)]")
    expect(markup).not.toContain("shadow-borders-interactive-with-active")
  })
})

describe("the neutral focus ring", () => {
  const globals = readFileSync(join(__dirname, "../../../../styles/globals.css"), "utf8")
  const tailwind = readFileSync(join(__dirname, "../../../../../tailwind.config.js"), "utf8")

  it("is declared for both modes in black or white alpha only", () => {
    const declarations = Array.from(globals.matchAll(/--borders-field-focus:([^;]+);/g), (m) => m[1])
    expect(declarations).toHaveLength(2)
    for (const value of declarations) {
      const colours = value.match(/rgba\([^)]*\)/g) ?? []
      expect(colours.length).toBeGreaterThan(0)
      for (const colour of colours) expect(colour).toMatch(/^rgba\((0, 0, 0|255, 255, 255), /)
    }
  })

  it("has the utility every field class names", () => {
    expect(tailwind).toContain('"borders-field-focus": "var(--borders-field-focus)"')
  })

  it("is what @medusajs/ui's own fields ring with too", () => {
    expect(globals).toMatch(
      /:is\(input, textarea, button\[role="combobox"\]\) \{\s*--borders-interactive-with-active: var\(--borders-field-focus\);/
    )
  })
})
