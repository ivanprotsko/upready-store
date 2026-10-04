import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Ivan 05.10 (ask-20261005-055104-2f6e): «в мобильной версии у контейнера
 * хедера не должно быть назначено ни одного цвета». The H7 header container,
 * the sticky wrapper, the bar and its columns, carries no fill, shadow or
 * border colour at any width, at rest or scrolled, light or dark; only the
 * pills, discs and the logo pill inside it have their own. Asserted on the
 * module source, the same convention `(main)/layout.test.ts` uses.
 */

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, "h7.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")

/** Every `selector { declarations }` rule, nested `@media` bodies included. */
const rules = Array.from(source.matchAll(/([^{}@]+)\{([^{}]*)\}/g)).map((match) => ({
  selectors: match[1].split(",").map((selector) => selector.trim()),
  body: match[2],
}))

const CONTAINER_CLASSES = [
  "root",
  "bar",
  "inner",
  "leading",
  "main",
  "trailing",
  "compact",
  "compactMain",
  "compactGroup",
]

/** A selector whose last compound is one of the container classes, nothing inside it. */
const isContainer = (selector: string) => {
  const last = selector.split(/\s+/).pop() ?? ""
  return CONTAINER_CLASSES.some((name) => new RegExp(`^\\.${name}(?:\\[[^\\]]*\\])?$`).test(last))
}

const COLOUR_PROPERTY = /(?:^|;)\s*(background(?:-color)?|box-shadow|border(?:-[a-z]+)?-color|border)\s*:\s*([^;]+)/g

describe("H7 header container: no colour of its own", () => {
  it("finds the container rules it checks", () => {
    expect(rules.some((rule) => rule.selectors.some(isContainer))).toBe(true)
  })

  it("no container rule paints a fill, a shadow or a border colour", () => {
    const painted = rules.flatMap((rule) =>
      rule.selectors.filter(isContainer).flatMap((selector) =>
        Array.from(rule.body.matchAll(COLOUR_PROPERTY))
          .filter(([, , value]) => !/^(transparent|none|0)$/.test(value.trim()))
          .map(([, property, value]) => `${selector} { ${property}: ${value.trim()} }`)
      )
    )
    expect(painted).toEqual([])
  })

  it("the scrolled compact bar no longer takes the page colour (QA f14 withdrawn)", () => {
    expect(source).not.toMatch(/\.root\[data-scrolled="true"\]\s+\.bar\s*\{[^}]*background/)
  })
})
