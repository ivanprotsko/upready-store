import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * t-2026-10-17-01: the panel in hub-v2's look through the preset's variables
 * (src/theme/hub-theme.css). The file has two layers: hub-v2's tokens under a
 * `--hub-` prefix, light in `:root` and dark in `.dark`, and the preset's
 * variables pointed at them. These checks keep the two themes in step, keep
 * every reference resolvable and keep the small grey text readable.
 *
 * The recolour is colours only: the fonts and the radii stay the preset's own
 * (Ivan 17.10.2026: «я хочу чтобы шрифты в перекрашеной мадели остались такими
 * же, а также радиус скруглений тоже не менялся»), and the scrollbars stay the
 * browser's (Ivan 17.10.2026: «А почему в перекрашеной версии появился видимый
 * скроллбар который создает отступ в левом сайдбаре»). No drop shadow is left
 * (Ivan 17.10.2026: «и не убраны тени» … «убрать, я же просил убрать»): a shadow
 * keeps only its lines, the 1px rings, inset lines and focus rings. The last
 * checks keep it so.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const css = readFileSync(join(SRC, "theme/hub-theme.css"), "utf8")
const index = readFileSync(join(SRC, "index.css"), "utf8")

const blockOf = (selector) => {
  const start = css.indexOf(`\n${selector} {\n`)
  assert.notEqual(start, -1, `hub-theme.css has no block ${selector}`)
  return css.slice(start, css.indexOf("\n}\n", start))
}
const declared = (block) =>
  new Map([...block.matchAll(/^\s+(--[a-z0-9-]+):\s*([^;]+);/gm)].map((m) => [m[1], m[2].trim()]))

const light = declared(blockOf(":root"))
const dark = declared(blockOf(".dark"))
const mapping = declared(blockOf("html:root"))
const darkMapping = declared(blockOf("html.dark"))

test("the light and the dark theme declare the same hub-v2 tokens", () => {
  assert.deepEqual([...light.keys()].sort(), [...dark.keys()].sort())
  assert.ok(light.size >= 20, `only ${light.size} tokens`)
})

test("every --hub-* token the mapping reads is declared", () => {
  const all = new Map([...light, ...mapping])
  for (const [name, value] of [...mapping, ...darkMapping, ...dark]) {
    for (const [, ref] of value.matchAll(/var\((--hub-[a-z0-9-]+)\)/g)) {
      assert.ok(all.has(ref), `${name} reads ${ref}, which is not declared`)
    }
  }
})

test("the mapping overrides only variables the Medusa preset declares, or its own --hub-*", () => {
  const require = createRequire(join(SRC, "..", "package.json"))
  const preset = readFileSync(require.resolve("@medusajs/ui-preset"), "utf8")
  for (const name of [...mapping.keys(), ...darkMapping.keys()]) {
    if (name.startsWith("--hub-")) continue
    assert.ok(preset.includes(`"${name}"`), `${name} is not a variable of @medusajs/ui-preset`)
  }
})

// A grey oklch(L 0 0): OKLab's L is the cube root of the relative luminance.
const greyL = (map, token, seen = new Set()) => {
  const value = map.get(token)
  assert.ok(value, `${token} is not declared`)
  const ref = value.match(/^var\((--hub-[a-z0-9-]+)\)$/)
  if (ref) {
    assert.ok(!seen.has(ref[1]), `${token} refers to itself`)
    return greyL(map, ref[1], seen.add(token))
  }
  const m = value.match(/^oklch\(([\d.]+) 0 0\)$/)
  assert.ok(m, `${token} is not a plain grey: ${value}`)
  return Number(m[1])
}
const contrast = (a, b) => {
  const [x, y] = [a ** 3, b ** 3]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

test("small grey text keeps 4.5:1 on a card and on a muted surface in both themes", () => {
  for (const [theme, map] of [
    ["light", light],
    ["dark", dark],
  ]) {
    for (const ink of ["--hub-subtle-foreground", "--hub-faint-foreground"]) {
      for (const surface of ["--hub-card", "--hub-muted"]) {
        const ratio = contrast(greyL(map, ink), greyL(map, surface))
        assert.ok(ratio >= 4.5, `${theme}: ${ink} on ${surface} is ${ratio.toFixed(2)}:1`)
      }
    }
  }
})

// The sheet without its comments, so a comment that names a property does not count.
const rules = css.replace(/\/\*[\s\S]*?\*\//g, "")

test("the theme sets no font and no radius: both stay the preset's", () => {
  for (const property of ["font-family", "font-weight", "font-size", "font", "line-height", "letter-spacing"]) {
    assert.doesNotMatch(rules, new RegExp(`(^|[;{\\s])${property}\\s*:`, "m"), `hub-theme.css sets ${property}`)
  }
  assert.doesNotMatch(rules, /@font-face|url\(/, "hub-theme.css loads a font")
  assert.doesNotMatch(rules, /--[a-z-]*(radius|font)[a-z-]*\s*:/, "hub-theme.css declares a font or radius token")
  assert.doesNotMatch(rules, /\bborder(-[a-z-]+)?-radius\s*:/, "hub-theme.css rounds a corner")
  assert.doesNotMatch(css + index, /https?:\/\//, "a stylesheet loads something from the network")
})

// A styled ::-webkit-scrollbar turns macOS's overlay scrollbars into classic ones, which take width from
// every scrolling element: the sidebar's content moved by 6 px.
test("the theme and index.css leave the scrollbars to the browser", () => {
  for (const [file, sheet] of [
    ["hub-theme.css", rules],
    ["index.css", index.replace(/\/\*[\s\S]*?\*\//g, "")],
  ]) {
    assert.doesNotMatch(sheet, /scrollbar/, `${file} styles a scrollbar`)
  }
})

// The layers of a box-shadow, split on the commas outside parentheses.
const layersOf = (value) => {
  const layers = [""]
  let depth = 0
  for (const ch of value) {
    depth += ch === "(" ? 1 : ch === ")" ? -1 : 0
    if (ch === "," && depth === 0) layers.push("")
    else layers[layers.length - 1] += ch
  }
  return layers.map((layer) => layer.trim())
}
// A layer draws a line, not a shadow, when its offsets and its blur are 0: a ring, an inset line, a focus
// halo. Colours (a function, a hex or `transparent`) and `inset` are dropped; the rest are the lengths.
const assertFlat = (name, value) => {
  if (value === "none") return
  for (const layer of layersOf(value)) {
    let rest = layer
    while (/[a-z-]+\([^()]*\)/i.test(rest)) rest = rest.replace(/[a-z-]+\([^()]*\)/gi, " ")
    const lengths = rest.replace(/\binset\b|\btransparent\b|#[0-9a-f]+/gi, " ").trim().split(/\s+/)
    assert.ok(
      lengths.length >= 2 && lengths.length <= 4 && lengths.every((l) => /^-?[\d.]+(px)?$/.test(l)),
      `${name}: cannot read the layer «${layer}»`
    )
    const [x, y, blur = 0] = lengths.map(parseFloat)
    assert.ok(x === 0 && y === 0 && blur === 0, `${name} draws a drop shadow: «${layer}»`)
  }
}

test("no shadow variable of the theme draws a drop shadow: every layer has zero offset and zero blur", () => {
  const require = createRequire(join(SRC, "..", "package.json"))
  const preset = readFileSync(require.resolve("@medusajs/ui-preset"), "utf8")
  // The preset's shadow variables: their values start with two lengths ("0px 1px …").
  const shadows = new Set(
    [...preset.matchAll(/"(--[a-z0-9-]+)":\s*"-?[\d.]+px\s+-?[\d.]+px\b/g)].map((m) => m[1])
  )
  assert.ok(shadows.size >= 20, `found only ${shadows.size} shadow variables in the preset`)
  // Every one is set here, so none falls back to Medusa's own drop shadow, in either theme.
  for (const name of shadows) assert.ok(mapping.has(name), `${name} keeps the preset's drop shadow`)
  const resolve = (value) => value.replace(/var\((--hub-focus-halo)\)/g, () => mapping.get("--hub-focus-halo"))
  for (const [name, value] of [...mapping, ...darkMapping]) {
    if (shadows.has(name) || name === "--hub-focus-halo") assertFlat(name, resolve(value))
  }
  assert.doesNotMatch(rules, /--hub-shadow/, "a --hub-shadow-* token is still declared")
})

test("tailwind.config.cjs turns Tailwind's own shadow and drop-shadow scales off", () => {
  const require = createRequire(join(SRC, "..", "package.json"))
  const resolveConfig = require("tailwindcss/resolveConfig")
  const { theme } = resolveConfig(require("./tailwind.config.cjs"))
  for (const [key, value] of Object.entries(theme.boxShadow)) {
    // The preset's named shadows read the variables checked above.
    if (/^var\(--[a-z0-9-]+\)$/.test(value)) continue
    assertFlat(`shadow-${key}`, value)
  }
  for (const [key, value] of Object.entries(theme.dropShadow)) {
    for (const layer of [].concat(value)) assertFlat(`drop-shadow-${key}`, layer)
  }
})

test("tailwind.config.cjs and package.json leave the fonts and the radii to the preset", () => {
  const require = createRequire(join(SRC, "..", "package.json"))
  const { theme = {} } = require("./tailwind.config.cjs")
  for (const key of ["borderRadius", "fontFamily", "fontWeight", "fontSize", "lineHeight", "letterSpacing"]) {
    assert.ok(!(key in theme) && !(key in (theme.extend ?? {})), `tailwind.config.cjs sets theme.${key}`)
  }
  const { dependencies = {}, devDependencies = {} } = JSON.parse(readFileSync(join(SRC, "..", "package.json"), "utf8"))
  const fonts = Object.keys({ ...dependencies, ...devDependencies }).filter((name) => name.startsWith("@fontsource"))
  assert.deepEqual(fonts, [], "the panel installs a font package")
})

test("index.css imports the theme before Tailwind's layers", () => {
  const at = index.indexOf('@import "./theme/hub-theme.css";')
  assert.notEqual(at, -1)
  assert.ok(at < index.indexOf("@tailwind base;"))
})
