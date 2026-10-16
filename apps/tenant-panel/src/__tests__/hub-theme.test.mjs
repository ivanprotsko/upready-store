import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * t-2026-10-17-01: the panel in hub-v2's look through the preset's variables
 * (src/theme/hub-theme.css). The file has two layers: hub-v2's tokens under a
 * `--hub-` prefix, light in `:root` and dark in `.dark`, and the preset's
 * variables pointed at them. These checks keep the two themes in step, keep
 * every reference resolvable, keep the small grey text readable, and keep the
 * fonts on this machine.
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

test("the fonts are self-hosted: every url() is a file of an installed package", () => {
  const urls = [...css.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1])
  assert.ok(urls.length >= 8, `only ${urls.length} font files`)
  const require = createRequire(join(SRC, "..", "package.json"))
  for (const url of urls) {
    assert.ok(url.startsWith("@fontsource-variable/"), `${url} is not a font package file`)
    const [scope, pkg, ...rest] = url.split("/")
    const root = dirname(require.resolve(`${scope}/${pkg}/package.json`))
    assert.ok(existsSync(join(root, ...rest)), `${url} does not exist`)
  }
  assert.doesNotMatch(css + index, /https?:\/\//, "a stylesheet loads something from the network")
})

test("index.css imports the theme before Tailwind's layers", () => {
  const at = index.indexOf('@import "./theme/hub-theme.css";')
  assert.notEqual(at, -1)
  assert.ok(at < index.indexOf("@tailwind base;"))
})
