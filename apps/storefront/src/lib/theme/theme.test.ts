import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { AXES, axis, isAllowed, isLightOnlyTheme } from "./attributes"
import { FONT_LOADERS, FONT_NAMES, FONT_STATIC_WEIGHTS, assertFontName, isFontName } from "./fonts"
import { themePrePaintScript } from "./pre-paint"
import { LIGHT_ONLY_THEME_IDS, THEME_IDS, THEME_TOKEN_COUNT } from "./presets.generated"

const REPO = join(__dirname, "../../../../..")
const SPECS = join(REPO, "specs/design-system")

const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"))

describe("the font allow-list", () => {
  it("is exactly the enum of store-profile.schema.json", () => {
    const schema = readJson(join(REPO, "specs/store-profiles/store-profile.schema.json"))
    expect(schema.definitions.font.enum).toEqual([...FONT_NAMES])
  })

  it("has a next/font/google loader name for every family", () => {
    expect(Object.keys(FONT_LOADERS).sort()).toEqual([...FONT_NAMES].sort())
    for (const name of FONT_NAMES) expect(FONT_LOADERS[name]).toMatch(/^[A-Z][A-Za-z0-9_]*$/)
  })

  it("names an explicit weight for every family with no variable axis", () => {
    // next/font/google refuses a call without `weight` for a non-variable family, and
    // the failure only surfaces during `next build` — so it is asserted here instead.
    // resolved through next itself: pnpm does not hoist it to the repo root
    const nextRoot = join(createRequire(__filename).resolve("next/package.json"), "..")
    const fontData = readJson(
      join(nextRoot, "dist/compiled/@next/font/dist/google/font-data.json")
    ) as Record<string, { weights?: string[] }>
    for (const name of FONT_NAMES) {
      expect(fontData[name], `${name} is not in next's font catalogue`).toBeDefined()
      const isVariable = (fontData[name].weights ?? []).includes("variable")
      const declared = Boolean(FONT_STATIC_WEIGHTS[name])
      expect(declared, `${name}: variable=${isVariable}, FONT_STATIC_WEIGHTS entry=${declared}`).toBe(!isVariable)
    }
  })

  it("rejects a name outside the list loudly rather than silently", () => {
    expect(isFontName("Comic Sans MS")).toBe(false)
    expect(() => assertFontName("Comic Sans MS", "profile.theme.typography.display")).toThrow(/not one of the twelve/)
    expect(assertFontName("Sora", "x")).toBe("Sora")
  })
})

describe("the axis registry", () => {
  it("allow-lists every preset the build emitted, plus the default alias", () => {
    expect(axis("data-theme").allowed).toEqual(["default", ...THEME_IDS])
    expect(axis("data-mode").allowed).toEqual(["light", "dark"])
  })

  it("refuses a value outside the allow-list", () => {
    expect(isAllowed("data-theme", "medusa")).toBe(true)
    expect(isAllowed("data-theme", "'><script>")).toBe(false)
    expect(isAllowed("data-mode", "sepia")).toBe(false)
    expect(isAllowed("data-mode", null)).toBe(false)
  })
})

describe("the pre-paint script", () => {
  const script = themePrePaintScript()

  it("carries one entry per axis, with its allow-list inlined", () => {
    for (const a of AXES) {
      expect(script).toContain(JSON.stringify(a.storageKey))
      expect(script).toContain(JSON.stringify(a.attr))
    }
    expect(script).toContain('"medusa"')
  })

  it("keeps going when one axis's storage read throws (inner catch)", () => {
    // Defence in depth needs a test that tells the two catches apart. The OUTER catch
    // alone would swallow the SecurityError and abandon the loop, losing the mode the
    // visitor did store; the INNER one lets the remaining axes through.
    const html: Record<string, string> = {}
    const document = { documentElement: { setAttribute: (k: string, v: string) => void (html[k] = v) } }
    const localStorage = {
      getItem: (k: string) => {
        if (k === "upready-store.theme") throw new DOMException("The operation is insecure.", "SecurityError")
        return "dark"
      },
    }
    expect(() => new Function("document", "localStorage", script)(document, localStorage)).not.toThrow()
    expect(html).toEqual({ "data-mode": "dark" })
  })

  it("never throws when localStorage throws on access", () => {
    // Safari in a private window throws on ACCESS to localStorage, not on the getter.
    const html: Record<string, string> = {}
    const document = {
      documentElement: {
        setAttribute: (k: string, v: string) => {
          html[k] = v
        },
      },
    }
    const exploding = {
      get localStorage(): Storage {
        throw new DOMException("The operation is insecure.", "SecurityError")
      },
    }
    expect(() => new Function("document", "self", `with(self){${script}}`)(document, exploding)).not.toThrow()
    expect(html).toEqual({})
  })

  it("never throws when the DOM does either (outer catch)", () => {
    // The inner catch only covers the storage read. Everything else the script touches —
    // documentElement, setAttribute — sits under the outer one, and a theme preference
    // is not worth a blank page.
    const document = {
      get documentElement(): never {
        throw new TypeError("documentElement is not available")
      },
    }
    const localStorage = { getItem: () => "geist" }
    expect(() => new Function("document", "localStorage", script)(document, localStorage)).not.toThrow()
  })

  it("applies a stored value and ignores one outside the allow-list", () => {
    const run = (store: Record<string, string>) => {
      const html: Record<string, string> = {}
      const document = { documentElement: { setAttribute: (k: string, v: string) => void (html[k] = v) } }
      const localStorage = { getItem: (k: string) => store[k] ?? null }
      new Function("document", "localStorage", script)(document, localStorage)
      return html
    }
    expect(run({ "upready-store.theme": "geist", "upready-store.mode": "dark" })).toEqual({
      "data-theme": "geist",
      "data-mode": "dark",
    })
    expect(run({ "upready-store.theme": "no-such-preset", "upready-store.mode": "sepia" })).toEqual({})
  })

  it("is idempotent", () => {
    const html: Record<string, string> = {}
    const document = { documentElement: { setAttribute: (k: string, v: string) => void (html[k] = v) } }
    const localStorage = { getItem: () => "geist" }
    const fn = new Function("document", "localStorage", script)
    fn(document, localStorage)
    const once = { ...html }
    fn(document, localStorage)
    expect(html).toEqual(once)
  })
})

describe("a light-only palette (t-2026-10-12-33 T0c)", () => {
  const run = (script: string, store: Record<string, string>) => {
    const html: Record<string, string> = {}
    const document = { documentElement: { setAttribute: (k: string, v: string) => void (html[k] = v) } }
    const localStorage = { getItem: (k: string) => store[k] ?? null }
    new Function("document", "localStorage", script)(document, localStorage)
    return html
  }

  it("is the seven lab palettes and nothing else", () => {
    for (const id of LIGHT_ONLY_THEME_IDS) expect(isLightOnlyTheme(id), id).toBe(true)
    for (const id of ["default", ...THEME_IDS]) expect(isLightOnlyTheme(id), id).toBe(false)
    expect(isLightOnlyTheme(null)).toBe(false)
  })

  it("keeps the page light whatever the visitor stored, and still applies the rest", () => {
    const script = themePrePaintScript({ lightOnly: true })
    expect(script).not.toContain('"upready-store.mode"')
    expect(run(script, { "upready-store.theme": "geist", "upready-store.mode": "dark" })).toEqual({
      "data-theme": "geist",
      "data-mode": "light",
    })
    expect(run(script, {})).toEqual({ "data-mode": "light" })
  })

  it("leaves every other page with today's script", () => {
    expect(themePrePaintScript({ lightOnly: false })).toBe(themePrePaintScript())
    expect(run(themePrePaintScript(), { "upready-store.mode": "dark" })).toEqual({ "data-mode": "dark" })
  })
})

describe("the generated bridge", () => {
  const css = readFileSync(join(__dirname, "../../styles/themes.css"), "utf8")
  const tokenMap = readJson(join(SPECS, "token-map.json"))

  it("covers every variable the installed preset declares", () => {
    expect(tokenMap.rows).toHaveLength(tokenMap.counts.presetVariables)
    for (const row of tokenMap.rows) expect(css).toContain(`  ${row.variable}:`)
  })

  it("splits the rows into mapped / diverged / open with no leftovers", () => {
    const seen = { mapped: 0, diverged: 0, open: 0 } as Record<string, number>
    for (const row of tokenMap.rows) seen[row.status]++
    expect(seen.mapped + seen.diverged + seen.open).toBe(tokenMap.counts.presetVariables)
    expect(seen).toEqual({
      mapped: tokenMap.counts.mapped,
      diverged: tokenMap.counts.diverged,
      open: tokenMap.counts.open,
    })
  })

  it("emits one block per preset per mode, plus the default alias", () => {
    for (const id of THEME_IDS) {
      for (const mode of ["light", "dark"]) {
        expect(css).toContain(`[data-theme="${id}"][data-mode="${mode}"]`)
      }
    }
    expect(css).toContain('[data-theme="default"][data-mode="light"]')
  })

  it("outranks the vendor preset, whose declarations are plain :root", () => {
    // (0,2,0) beats (0,1,0); without the :not() the bridge would lose to nothing but
    // source order, and Tailwind's base layer moves.
    expect(css).toContain(':root:not([data-theme-bridge="off"])')
    expect(css).toContain('[data-mode="dark"]:not([data-theme-bridge="off"])')
  })

  it("gives both presets the same key set in both modes", () => {
    const medusa = readJson(join(SPECS, "themes/medusa.theme.json"))
    const geist = readJson(join(SPECS, "themes/geist.theme.json"))
    const keys = Object.keys(medusa.modes.light.tokens).sort()
    expect(keys).toHaveLength(THEME_TOKEN_COUNT)
    for (const preset of [medusa, geist]) {
      for (const mode of ["light", "dark"]) {
        expect(Object.keys(preset.modes[mode].tokens).sort()).toEqual(keys)
      }
    }
  })

  it("keeps the WCAG-corrected link colour that globals.css used to override", () => {
    const medusa = readJson(join(SPECS, "themes/medusa.theme.json"))
    expect(medusa.modes.light.tokens["--link"]).toBe("rgba(37, 99, 235, 1)")
    const row = tokenMap.rows.find((r: { variable: string }) => r.variable === "--fg-interactive")
    expect(row.status).toBe("mapped")
    expect(row.effective.light).toBe("rgba(37, 99, 235, 1)")
    expect(css).toContain("--fg-interactive: var(--link);")
    // and the old special case is gone from globals.css
    const globals = readFileSync(join(__dirname, "../../styles/globals.css"), "utf8")
    expect(globals).not.toMatch(/^\s*--fg-interactive:/m)
  })
})
