import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Ajv from "ajv/dist/2020"
import { describe, expect, it } from "vitest"

import { LIGHT_ONLY_THEME_IDS, THEME_IDS, THEME_LABELS } from "./presets.generated"

/**
 * The palettes of the 16.09 templates lab (`artifacts/docs/store-templates-lab/tools/palettes.json`)
 * as light-only presets a template can name (t-2026-10-12-33 T0a): valid, painted light whatever
 * data-mode says, readable, and the generated files in step with the generator.
 */

const SF = join(__dirname, "../../..")
const SPECS = join(SF, "../../specs/design-system")
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"))
const tokensOf = (id: string): Record<string, string> =>
  readJson(join(SPECS, "themes", `${id}.theme.json`)).modes.light.tokens
const committed = (path: string) => readFileSync(join(SF, path), "utf8")
const css = committed("src/styles/themes.css")

/** The brief's English working names. */
const LAB_LABELS: Record<string, string> = {
  ferma: "Ferma",
  interier: "Interior",
  katalog: "Catalogue",
  lending: "Landing",
  moda: "Moda",
  opt: "Wholesale",
  uhod: "Care",
}

/**
 * The pairs a lab palette paints text and controls with. Text 4.5:1 (WCAG 1.4.3): the lab's own
 * `tools/contrast.mjs` list without `--surface-media`, which has no canon row, plus the storefront's
 * card and muted surfaces and the status inks on the page. UI 3:1 (1.4.11): the filled button and
 * the focus ring against the page. Hairlines (`--border`, `--input`) are measured in the report and
 * not held here, as the generator holds no preset's hairline.
 */
const PAIRS: [string, string, number][] = [
  ["--foreground", "--background", 4.5],
  ["--foreground", "--secondary", 4.5],
  ["--muted-foreground", "--background", 4.5],
  ["--muted-foreground", "--secondary", 4.5],
  ["--muted-foreground", "--muted", 4.5],
  ["--muted-foreground", "--card", 4.5],
  ["--secondary-foreground", "--secondary", 4.5],
  ["--card-foreground", "--card", 4.5],
  ["--popover-foreground", "--popover", 4.5],
  ["--primary-foreground", "--primary", 4.5],
  ["--accent-foreground", "--accent", 4.5],
  ["--destructive-foreground", "--destructive", 4.5],
  ["--link", "--background", 4.5],
  ["--link", "--card", 4.5],
  ["--success", "--background", 4.5],
  ["--warning", "--background", 4.5],
  ["--destructive", "--background", 4.5],
  ["--primary", "--background", 3],
  ["--ring", "--background", 3],
]

type Rgb = [number, number, number]
const hex = (value: string): Rgb => {
  const m = /^#([0-9a-f]{6})$/i.exec(value.trim())
  if (!m) throw new Error(`not a #rrggbb colour: "${value}"`)
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) as Rgb
}
const luminance = (c: Rgb) => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** The palette block of themes.css whose selector list names `selectors`, as name -> value. */
function block(selectors: string[]): Record<string, string> | null {
  for (const m of Array.from(css.matchAll(/((?:\[data-theme="[a-z-]+"\]\[data-mode="(?:light|dark)"\],?\s*)+)\{([^}]*)\}/g))) {
    if (!selectors.every((s) => m[1].includes(s))) continue
    const vars: Record<string, string> = {}
    for (const d of Array.from(m[2].matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g))) vars[d[1]] = d[2]
    if (vars["--background"]) return vars
  }
  return null
}

describe("the lab palettes", () => {
  it("are the light-only presets, under the brief's working names, and in no shop picker", () => {
    expect([...LIGHT_ONLY_THEME_IDS]).toEqual(Object.keys(LAB_LABELS))
    for (const [id, label] of Object.entries(LAB_LABELS)) expect(THEME_LABELS[id], id).toBe(label)
    // the onboarding wizard and the studio panel offer THEME_IDS beside a mode switch
    for (const id of LIGHT_ONLY_THEME_IDS) expect(THEME_IDS as readonly string[]).not.toContain(id)
  })

  it.each([...LIGHT_ONLY_THEME_IDS])("%s validates, has no dark mode and every canon key", (id) => {
    const validate = new Ajv({ allErrors: true, strict: false }).compile(readJson(join(SPECS, "theme-preset.schema.json")))
    const preset = readJson(join(SPECS, "themes", `${id}.theme.json`))
    expect(validate(preset), JSON.stringify(validate.errors)).toBe(true)
    expect(preset.modes.dark).toBeUndefined()
    expect(Object.keys(tokensOf(id)).sort()).toEqual(Object.keys(tokensOf("medusa")).sort())
  })

  it.each([...LIGHT_ONLY_THEME_IDS])("%s paints its light tokens under both data-mode values", (id) => {
    const painted = block([`[data-theme="${id}"][data-mode="light"]`, `[data-theme="${id}"][data-mode="dark"]`])
    expect(painted, `${id}: no block for both modes in themes.css`).not.toBeNull()
    expect(painted).toEqual(tokensOf(id))
  })

  it("keeps Medusa's dark-only bridge rows off them", () => {
    const skip = LIGHT_ONLY_THEME_IDS.map((id) => `[data-theme="${id}"]`).join(", ")
    expect(css).toContain(`[data-mode="dark"]:not([data-theme-bridge="off"]):where(:not(${skip})) {`)
  })

  it.each([...LIGHT_ONLY_THEME_IDS])("%s clears WCAG AA on every pair it paints text and controls with", (id) => {
    const t = tokensOf(id)
    const failures = PAIRS.flatMap(([ink, surface, min]) => {
      const ratio = contrast(hex(t[ink]), hex(t[surface]))
      return ratio + 1e-9 < min ? [`${ink} on ${surface}: ${ratio.toFixed(2)}:1 < ${min}:1`] : []
    })
    // the lab's inverted footer sets its meta line in --primary-foreground at 0.8 on --primary
    const [fg, bg] = [hex(t["--primary-foreground"]), hex(t["--primary"])]
    const meta = fg.map((c, i) => Math.round(c * 0.8 + bg[i] * 0.2)) as Rgb
    if (contrast(meta, bg) < 4.5) failures.push(`inverted footer meta: ${contrast(meta, bg).toFixed(2)}:1`)
    expect(failures).toEqual([])
  })
})

describe("themes:build output", () => {
  // Spawns the generator as the fonts-generator tests do; same timeout and reason.
  it("is committed and in step with the generator", () => {
    const dir = mkdtempSync(join(tmpdir(), "themes-build-"))
    execFileSync("node", [join(SF, "scripts/build-themes.mjs")], {
      cwd: SF,
      stdio: "pipe",
      env: { ...process.env, THEME_OUT_DIR: dir },
    })
    const files: [string, string][] = [
      ["themes.css", "src/styles/themes.css"],
      ["presets.generated.ts", "src/lib/theme/presets.generated.ts"],
      ["fonts.generated.ts", "src/lib/theme/fonts.generated.ts"],
    ]
    const stale = files.filter(([fresh, path]) => readFileSync(join(dir, fresh), "utf8") !== committed(path)).map(([, path]) => path)
    expect(stale, "run `pnpm themes:build` and commit the result").toEqual([])
  }, 30_000)
})
