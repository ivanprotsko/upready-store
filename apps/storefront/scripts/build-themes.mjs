#!/usr/bin/env node
/**
 * themes:build — compiles the theme presets into apps/storefront/src/styles/themes.css.
 *
 * Input   specs/design-system/themes/*.theme.json   (upready.theme-preset/v0)
 *         specs/design-system/token-map.json        (one row per @medusajs/ui-preset variable)
 * Output  apps/storefront/src/styles/themes.css, imported by globals.css
 *
 * The output has two halves:
 *
 *   1. one [data-theme="<id>"][data-mode="<mode>"] block per preset per mode, carrying
 *      the canon tokens (the shadcn-style names of ~/upready/packages/geist-kit/theme.css);
 *   2. one bridge that re-declares every Medusa UI variable in terms of those canon
 *      tokens, so the ~35 *-ui-* utilities already spread across src/** inherit the
 *      active preset without a single component being rewritten.
 *
 * The bridge wins over the vendor preset by specificity: :root:not([data-theme-bridge="off"])
 * is (0,2,0) against the preset's plain :root (0,1,0), which also neutralises the
 * preset's own `@media (prefers-color-scheme: dark)` block — mode is ours to decide now,
 * not the operating system's.
 *
 * `[data-theme-bridge="off"]` on <html> turns the whole bridge back off and hands the
 * page to the raw vendor variables. That is the control side of the T0h.5 compatibility
 * proof: bridge-on and bridge-off are screenshotted in the SAME run, so the measurement
 * cannot drift with anything else moving in the worktree.
 *
 * Determinism: keys are emitted in the order of the token map and of a sorted token
 * list, nothing is timestamped, so the same input produces a byte-identical file.
 *
 * A preset with no `modes.dark` is LIGHT ONLY (t-2026-10-12-33: the palettes of the 16.09
 * templates lab, drawn in light alone). Its light tokens and solved inks are written under
 * both data-mode values, the dark-only bridge rows skip it, and every gate measures it once.
 * It stays out of THEME_IDS, the list the shop pickers offer next to a mode switch, and goes
 * to LIGHT_ONLY_THEME_IDS, the palettes a template may name with a light default.
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
// the preset schema is draft 2020-12; ajv's default export only knows draft-07
const Ajv = require("ajv/dist/2020")

const HERE = dirname(fileURLToPath(import.meta.url))
const STOREFRONT = resolve(HERE, "..")
const REPO = resolve(STOREFRONT, "../..")
const SPECS = join(REPO, "specs/design-system")
// overridable so the font path can be exercised against a fixture without writing the
// real profile, which another generator owns (see theme.test.ts); THEME_OUT_DIR takes all
// three outputs, so a test can also hold the committed files to a fresh run
const PROFILE_JSON = process.env.THEME_PROFILE_JSON || join(STOREFRONT, "src/lib/profile/profile.generated.json")
const OUT_DIR_OVERRIDE = process.env.THEME_OUT_DIR || null
const OUT = OUT_DIR_OVERRIDE ? join(OUT_DIR_OVERRIDE, "themes.css") : join(STOREFRONT, "src/styles/themes.css")
const OUT_PRESETS = OUT_DIR_OVERRIDE
  ? join(OUT_DIR_OVERRIDE, "presets.generated.ts")
  : join(STOREFRONT, "src/lib/theme/presets.generated.ts")
const OUT_FONTS = join(STOREFRONT, "src/lib/theme/fonts.generated.ts")

/**
 * `default` is what the pre-paint and the SSR fallback use when no profile has named a
 * preset. It is an alias, not a fourth theme: today's look is the medusa preset, so a
 * storefront with no profile at all still renders exactly what it rendered yesterday.
 */
const DEFAULT_ALIAS_OF = "medusa"

const isLightOnly = (preset) => !preset.modes.dark

/** The modes a preset writes, each with the data-mode values its block paints. */
const paintedModes = (preset) =>
  isLightOnly(preset)
    ? [{ mode: "light", paints: ["light", "dark"] }]
    : [
        { mode: "light", paints: ["light"] },
        { mode: "dark", paints: ["dark"] },
      ]

/** The selectors of one written mode, with the default alias where it applies. */
function modeSelectors(preset, paints, suffix = "") {
  const ids = preset.id === DEFAULT_ALIAS_OF ? [preset.id, "default"] : [preset.id]
  return ids.flatMap((id) => paints.map((m) => `[data-theme="${id}"][data-mode="${m}"]${suffix}`))
}

function main() {
  const schema = readJson(join(SPECS, "theme-preset.schema.json"))
  const tokenMap = readJson(join(SPECS, "token-map.json"))

  const files = readdirSync(join(SPECS, "themes"))
    .filter((f) => f.endsWith(".theme.json"))
    .sort()
  if (files.length === 0) fail("specs/design-system/themes holds no *.theme.json")

  const ajv = new Ajv({ allErrors: true, strict: false })
  const validate = ajv.compile(schema)

  const presets = []
  for (const file of files) {
    const path = join(SPECS, "themes", file)
    const preset = readJson(path)
    if (!validate(preset)) {
      fail(`${file} does not validate against theme-preset.schema.json:\n` + ajv.errorsText(validate.errors, { separator: "\n  " }))
    }
    if (`${preset.id}.theme.json` !== file) fail(`${file} declares id "${preset.id}"; file name and id must agree`)
    presets.push(preset)
  }

  // --- the key set must be identical across every mode of every preset ---
  const reference = Object.keys(presets[0].modes.light.tokens).sort()
  for (const p of presets) {
    for (const { mode } of paintedModes(p)) {
      const keys = Object.keys(p.modes[mode].tokens).sort()
      const missing = reference.filter((k) => !keys.includes(k))
      const extra = keys.filter((k) => !reference.includes(k))
      if (missing.length || extra.length) {
        fail(
          `${p.id}/${mode}: ${missing.length} missing, ${extra.length} unexpected` +
            (missing.length ? `\n  missing: ${missing.join(" ")}` : "") +
            (extra.length ? `\n  unexpected: ${extra.join(" ")}` : "")
        )
      }
    }
  }
  const lightOnly = presets.filter(isLightOnly)
  console.log(
    `${reference.length} keys, 0 missing (${presets.length - lightOnly.length} presets x 2 modes, ${lightOnly.length} light only)`
  )

  // --- emit ---
  const out = []
  out.push("/*")
  out.push(" * GENERATED by apps/storefront/scripts/build-themes.mjs (pnpm themes:build) — do not edit.")
  out.push(" * Sources: specs/design-system/themes/*.theme.json + specs/design-system/token-map.json")
  out.push(` * Presets: ${presets.map((p) => p.id).join(", ")}. Canon dictionary: geist-kit/theme.css.`)
  out.push(" */")
  out.push("")

  for (const preset of presets) {
    for (const { mode, paints } of paintedModes(preset)) {
      out.push(`${modeSelectors(preset, paints).join(",\n")} {`)
      for (const key of reference) out.push(`  ${key}: ${preset.modes[mode].tokens[key]};`)
      out.push("}")
      out.push("")
    }
  }

  // --- bridge ---
  const light = []
  const dark = []
  const counts = { mapped: 0, diverged: 0, open: 0 }
  for (const row of tokenMap.rows) {
    counts[row.status]++
    if (row.status === "open") {
      // no canon counterpart yet: the row keeps the value the vendor preset shipped,
      // so today's look survives and the architect gets a list to decide on.
      light.push(`  ${row.variable}: ${row.effective.light};`)
      if (row.effective.dark !== row.effective.light) dark.push(`  ${row.variable}: ${row.effective.dark};`)
      continue
    }
    light.push(`  ${row.bridge}`)
    if (row.bridgeDark) dark.push(`  ${row.bridgeDark}`)
  }

  out.push(`/* bridge: ${tokenMap.counts.presetVariables} Medusa UI variables follow the canon tokens */`)
  out.push(`/* ${counts.mapped} mapped, ${counts.diverged} diverged, ${counts.open} open */`)
  out.push(':root:not([data-theme-bridge="off"]) {')
  out.push(...light)
  out.push("}")
  out.push("")
  out.push("/* rows whose two modes need different blends (Medusa's dark ramp is white-at-low-alpha) */")
  // a light-only preset keeps its light blends in dark mode too; :where() adds no
  // specificity, so every other preset meets this block exactly as before
  const skipLightOnly = lightOnly.length
    ? `:where(:not(${lightOnly.map((p) => `[data-theme="${p.id}"]`).join(", ")}))`
    : ""
  if (lightOnly.length) out.push(`/* light-only presets keep the light rows: ${lightOnly.map((p) => p.id).join(", ")} */`)
  out.push(`[data-mode="dark"]:not([data-theme-bridge="off"])${skipLightOnly} {`)
  out.push(...dark)
  out.push("}")
  out.push("")

  out.push(...emitContrastTargets(tokenMap, presets))

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, out.join("\n"))
  console.log(`wrote ${OUT} (${out.length} lines)`)

  writePresetsModule(presets, reference.length)
  writeFontsModule()
  console.log(`bridge rows: ${counts.mapped} mapped, ${counts.diverged} diverged, ${counts.open} open`)
  console.log(`dark-only re-declarations: ${dark.length}`)
  const open = tokenMap.rows.filter((r) => r.status === "open").map((r) => r.variable)
  console.log(`open rows (no canon counterpart): ${open.join(" ")}`)
}

/* ------------------------------------------------------------------------- *
 * contrast-targeted rows
 *
 * A row whose derivation is `contrast-target` carries no percentage. It names a WCAG
 * ratio and, per ink, the canon anchors it may start from, the surface it is pulled
 * TOWARD, and the surfaces it is read ON. This script is the only one that holds every
 * preset file open at once, so it is where the numbers are solved.
 *
 * The walk starts at the anchor with the best worst-case contrast over the ink's surface
 * set and steps toward the surface colour, keeping the LAST step whose whole run still
 * clears the ratio. That direction matters: the answer is the MOST MUTED colour that
 * passes, not the most legible one. Disabled text lifted to 16:1 reads as enabled, which
 * trades a usability bug for an accessibility number.
 *
 * Output goes into per-preset blocks of specificity (0,3,0), which beats the bridge's
 * (0,2,0) while still collapsing under [data-theme-bridge="off"].
 * ------------------------------------------------------------------------- */

/**
 * The accent written as TEXT: the price, the first of the places a style board hands the
 * accent (electronics §3.2). --primary is a fill colour first, and on some presets it is
 * not an ink at all — medusa dark's is rgb(82,82,91) on rgb(33,33,36), 2.2:1 — so the price
 * cannot read var(--primary) raw. This ink IS --primary wherever --primary clears the ratio
 * on the page, and otherwise the nearest colour toward --foreground that does. Components
 * read it as var(--fg-accent, var(--fg-base)), so with the bridge off the price keeps the
 * vendor ink.
 */
const ACCENT_INK = {
  variable: "--fg-accent",
  ratio: 4.5,
  anchors: ["--primary"],
  toward: "--foreground",
  surfaces: ["--background", "--card"],
  prefer: "anchor",
}

function emitContrastTargets(tokenMap, presets) {
  const rows = tokenMap.rows.filter((r) => r.derivation?.kind === "contrast-target")
  if (rows.length === 0) return []

  const out = ["/* contrast-targeted inks, solved per preset per mode — see token-map.json */"]
  for (const row of rows) {
    out.push(`/* ${row.variable}: ${row.derivation.ratio}:1 minimum, most muted colour that clears it */`)
  }
  out.push(`/* ${ACCENT_INK.variable}: ${ACCENT_INK.ratio}:1 minimum, --primary itself or the nearest colour toward --foreground that clears it */`)
  const table = []
  const solvedInks = {}
  for (const preset of presets) {
    for (const { mode, paints } of paintedModes(preset)) {
      const tokens = preset.modes[mode].tokens
      const decls = []
      const inks = (solvedInks[`${preset.id}/${mode}`] = {})
      const solveOne = (ink, ratio) => {
        const solved = solveContrast(ink, ratio, tokens, `${preset.id}/${mode}`)
        decls.push(`  ${ink.variable}: ${rgbStr(solved.colour)};`)
        inks[ink.variable] = solved.colour
        table.push({ preset: preset.id, mode, ink: ink.variable, ratio: solved.worst, ceiling: solved.ceiling, short: solved.short })
      }
      for (const row of rows) {
        for (const ink of row.derivation.solve) solveOne(ink, row.derivation.ratio)
      }
      solveOne(ACCENT_INK, ACCENT_INK.ratio)
      out.push(`${modeSelectors(preset, paints, ':not([data-theme-bridge="off"])').join(",\n")} {`)
      out.push(...decls)
      out.push("}")
      out.push("")
    }
  }

  // the run IS the measurement: print what every cell reached, and fail loudly on a cell
  // no colour on the anchor-to-surface line can reach.
  const inks = [...new Set(table.map((t) => t.ink))]
  console.log("")
  console.log(`contrast targets (minimum ${[...rows.map((r) => r.derivation.ratio), ACCENT_INK.ratio].join("/")}:1):`)
  console.log(`  ${"preset".padEnd(16)}${"mode".padEnd(7)}${inks.map((i) => i.replace(/^--/, "").padEnd(24)).join("")}`)
  for (const preset of presets) {
    for (const { mode } of paintedModes(preset)) {
      const cells = inks.map((i) => {
        const c = table.find((t) => t.preset === preset.id && t.mode === mode && t.ink === i)
        return `${c.ratio.toFixed(2)}:1 (ceiling ${c.ceiling.toFixed(2)})`.padEnd(24)
      })
      console.log(`  ${preset.id.padEnd(16)}${mode.padEnd(7)}${cells.join("")}`)
    }
  }
  const short = table.filter((t) => t.short)
  if (short.length) {
    fail(
      "contrast target unreachable:\n  " +
        short.map((t) => `${t.preset}/${t.mode} ${t.ink}: best possible ${t.ceiling.toFixed(2)}:1`).join("\n  ")
    )
  }
  gateInvertedInks(tokenMap, presets)
  gateDisabledPair(tokenMap, presets, solvedInks)
  return out
}

/** One ink, one preset, one mode. Returns the colour and the ratio it actually reached. */
function solveContrast(ink, ratio, tokens, where) {
  const surfaces = ink.surfaces.map((k) => needColour(tokens, k, where))
  const toward = needColour(tokens, ink.toward, where)
  const worstOn = (c) => Math.min(...surfaces.map((s) => contrast(c, s)))

  let anchor = null
  for (const key of ink.anchors) {
    const c = needColour(tokens, key, where)
    const worst = worstOn(c)
    if (!anchor || worst > anchor.worst) anchor = { colour: c, worst }
  }

  // an ink that IS a canon colour (the accent) stays that colour when it passes, and
  // otherwise takes the first step toward `toward` that does: the least departure from it
  if (ink.prefer === "anchor") {
    if (anchor.worst + 1e-9 >= ratio) return { ...anchor, ceiling: anchor.worst, short: false }
    for (let pct = 100; pct >= 0; pct -= 0.5) {
      const c = mixSrgb(anchor.colour, toward, pct)
      const worst = worstOn(c)
      if (worst + 1e-9 >= ratio) return { colour: c, worst, ceiling: worstOn(toward), short: false }
    }
    return { ...anchor, ceiling: worstOn(toward), short: true }
  }

  // step toward the surface, keeping the last colour of the contiguous passing run
  let keep = { colour: anchor.colour, worst: anchor.worst }
  for (let pct = 100; pct >= 0; pct -= 0.5) {
    const c = mixSrgb(anchor.colour, toward, pct)
    const worst = worstOn(c)
    if (worst + 1e-9 < ratio) break
    keep = { colour: c, worst }
  }
  return { ...keep, ceiling: anchor.worst, short: anchor.worst + 1e-9 < ratio }
}

function needColour(tokens, key, where) {
  const c = parseColour(tokens[key])
  if (!c) fail(`${where}: ${key} is missing or is not a colour ("${tokens[key]}")`)
  return c
}

function parseColour(value) {
  const v = String(value ?? "").trim()
  let m = /^#([0-9a-fA-F]{6})$/.exec(v)
  if (m) {
    const n = parseInt(m[1], 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
  }
  m = /^#([0-9a-fA-F]{3})$/.exec(v)
  if (m) {
    const h = m[1]
    return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) }
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(v)
  if (m) {
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number)
    if (p.length >= 3 && p.slice(0, 3).every((n) => Number.isFinite(n))) return { r: p[0], g: p[1], b: p[2] }
  }
  return null
}

/** color-mix(in srgb, A pct%, B), rounded exactly as the browser hands it back. */
function mixSrgb(A, B, pct) {
  const f = (a, b) => Math.round((a * pct + b * (100 - pct)) / 100)
  return { r: f(A.r, B.r), g: f(A.g, B.g), b: f(A.b, B.b) }
}

/** WCAG 2.1 relative luminance and contrast ratio. */
function channel(c) {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

function luminance(c) {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b)
}

function contrast(a, b) {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const rgbStr = (c) => `rgb(${c.r}, ${c.g}, ${c.b})`

/* ------------------------------------------------------------------------- *
 * gates — the build fails when a preset breaks one of these, whoever authored it
 * ------------------------------------------------------------------------- */

const AA = 4.5

/**
 * Cause E. --contrast-fg-primary and -secondary are read on --contrast-bg-base, which is
 * dark in both modes (tooltip, promo banner, cart count badge). Their bridge rows follow
 * canon tokens that differ per preset, so each preset × mode is resolved here and the ink,
 * composited over the surface the way the browser paints it, has to clear AA.
 * --contrast-border-base is printed, not gated: it is a hairline, and WCAG asks nothing of
 * a decorative edge.
 */
function gateInvertedInks(tokenMap, presets) {
  const row = (v) => tokenMap.rows.find((r) => r.variable === v) ?? fail(`token-map.json has no ${v} row`)
  const surface = row("--contrast-bg-base")
  const inks = ["--contrast-fg-primary", "--contrast-fg-secondary", "--contrast-border-base"].map(row)
  const failures = []
  console.log("")
  console.log(`inverted-surface inks on --contrast-bg-base (gate ${AA}:1 on the two inks; the border is printed only):`)
  console.log(`  ${"preset".padEnd(16)}${"mode".padEnd(7)}${inks.map((r) => r.variable.replace(/^--/, "").padEnd(24)).join("")}`)
  for (const preset of presets) {
    for (const { mode } of paintedModes(preset)) {
      const tokens = preset.modes[mode].tokens
      const where = `${preset.id}/${mode}`
      const bg = parseColour(surface.effective[mode]) ?? fail(`${where}: --contrast-bg-base is not a colour`)
      const cells = inks.map((r) => {
        if (r.status === "open") fail(`${r.variable} left the bridge (status open): it needs its bridge and bridgeDark rows back`)
        const decl = mode === "dark" && r.bridgeDark ? r.bridgeDark : r.bridge
        const ratio = contrast(over(resolveBridge(decl, tokens, where), bg), bg)
        if (r.variable !== "--contrast-border-base" && ratio + 1e-9 < AA) failures.push(`${where} ${r.variable}: ${ratio.toFixed(2)}:1`)
        return `${ratio.toFixed(2)}:1`.padEnd(24)
      })
      console.log(`  ${preset.id.padEnd(16)}${mode.padEnd(7)}${cells.join("")}`)
    }
  }
  if (failures.length) fail(`inverted-surface ink under ${AA}:1:\n  ${failures.join("\n  ")}`)
}

/**
 * The disabled pair. Three things per preset × mode, measured on the values this run
 * wrote rather than on the solver's word for them:
 *   - --bg-disabled follows --muted (a disabled control recedes; bridged to --accent it
 *     was louder than the enabled CTA on womens-fashion);
 *   - the ink the button writes on it, --fg-disabled-on-surface, clears AA on --muted, and
 *     --fg-disabled-on-page clears AA on every page surface it is solved for;
 *   - the disabled surface stands off the page less than the enabled CTA (--primary) does.
 */
function gateDisabledPair(tokenMap, presets, solvedInks) {
  const bgRow = tokenMap.rows.find((r) => r.variable === "--bg-disabled")
  if (!bgRow || bgRow.canonToken !== "--muted" || bgRow.bridge !== "--bg-disabled: var(--muted);" || bgRow.bridgeDark) {
    fail(`--bg-disabled must follow --muted in both modes; token-map.json has ${JSON.stringify(bgRow?.bridge)} / ${JSON.stringify(bgRow?.bridgeDark)}`)
  }
  const fgRow = tokenMap.rows.find((r) => r.variable === "--fg-disabled")
  const pageInk = fgRow?.derivation?.solve?.find((s) => s.variable === "--fg-disabled-on-page")
  if (!pageInk) fail("token-map.json: --fg-disabled no longer solves --fg-disabled-on-page")
  const failures = []
  console.log("")
  console.log(`disabled pair (gate ${AA}:1; --bg-disabled = --muted; disabled quieter than the CTA):`)
  console.log(`  ${"preset".padEnd(16)}${"mode".padEnd(7)}${"on-surface/--muted".padEnd(22)}${"on-page, worst".padEnd(18)}${"muted|page".padEnd(14)}primary|page`)
  for (const preset of presets) {
    for (const { mode } of paintedModes(preset)) {
      const tokens = preset.modes[mode].tokens
      const where = `${preset.id}/${mode}`
      const inks = solvedInks[where]
      const muted = needColour(tokens, "--muted", where)
      const page = needColour(tokens, "--background", where)
      const primary = needColour(tokens, "--primary", where)
      const onSurface = contrast(inks["--fg-disabled-on-surface"], muted)
      const onPage = Math.min(...pageInk.surfaces.map((k) => contrast(inks["--fg-disabled-on-page"], needColour(tokens, k, where))))
      const quiet = contrast(muted, page)
      const loud = contrast(primary, page)
      if (onSurface + 1e-9 < AA) failures.push(`${where} --fg-disabled-on-surface on --muted: ${onSurface.toFixed(2)}:1`)
      if (onPage + 1e-9 < AA) failures.push(`${where} --fg-disabled-on-page: ${onPage.toFixed(2)}:1`)
      if (quiet >= loud) failures.push(`${where} --muted stands off the page (${quiet.toFixed(2)}:1) at least as much as --primary (${loud.toFixed(2)}:1)`)
      console.log(
        `  ${preset.id.padEnd(16)}${mode.padEnd(7)}${`${onSurface.toFixed(2)}:1`.padEnd(22)}${`${onPage.toFixed(2)}:1`.padEnd(18)}` +
          `${`${quiet.toFixed(2)}:1`.padEnd(14)}${loud.toFixed(2)}:1`
      )
    }
  }
  if (failures.length) fail(`disabled pair:\n  ${failures.join("\n  ")}`)
}

/**
 * The two shapes the gated bridge rows are written in: `var(--x)` and
 * `color-mix(in srgb, var(--x) P%, transparent)`. Anything else is a gate that can no longer
 * read its row, which fails rather than passing unread.
 */
function resolveBridge(decl, tokens, where) {
  const value = decl.replace(/^[^:]+:\s*/, "").replace(/;\s*$/, "").trim()
  let m = /^var\((--[\w-]+)\)$/.exec(value)
  if (m) return { ...needColour(tokens, m[1], where), a: 1 }
  m = /^color-mix\(in srgb, var\((--[\w-]+)\) ([\d.]+)%, transparent\)$/.exec(value)
  if (m) return { ...needColour(tokens, m[1], where), a: Number(m[2]) / 100 }
  fail(`${where}: the gate cannot read "${value}"`)
}

/** Source-over compositing of a translucent ink onto an opaque surface. */
function over(ink, surface) {
  const a = ink.a ?? 1
  const f = (k) => ink[k] * a + surface[k] * (1 - a)
  return { r: f("r"), g: f("g"), b: f("b") }
}

/**
 * The allow-list the pre-paint script and the panel narrow against, generated from the
 * preset files so it cannot drift from what themes.css actually contains. `labels` is
 * what the panel shows (rule 18e: never a raw id on screen); `tokenCount` feeds its
 * "rendered from N tokens of preset <label>" source line.
 */
function writePresetsModule(presets, tokenCount) {
  const ids = (list) => list.map((p) => JSON.stringify(p.id)).join(", ")
  const lines = [
    "// GENERATED by scripts/build-themes.mjs (pnpm themes:build) — do not edit.",
    "// Mirrors specs/design-system/themes/*.theme.json.",
    "",
    `export const THEME_IDS = [${ids(presets.filter((p) => !isLightOnly(p)))}] as const`,
    'export const THEME_MODES = ["light", "dark"] as const',
    "",
    "export type ThemeId = (typeof THEME_IDS)[number]",
    "export type ThemeMode = (typeof THEME_MODES)[number]",
    "",
    "/**",
    " * Presets with no dark mode, painted light under both data-mode values. A template may",
    " * name one with a light default; no shop picker offers one, because a shop's visitor can",
    " * switch to dark.",
    " */",
    `export const LIGHT_ONLY_THEME_IDS = [${ids(presets.filter(isLightOnly))}] as const`,
    "",
    "export type LightOnlyThemeId = (typeof LIGHT_ONLY_THEME_IDS)[number]",
    "",
    "/** Plain-language names for the settings panel; ids never reach the screen. */",
    "export const THEME_LABELS: Record<string, string> = {",
    `  default: ${JSON.stringify(presets.find((p) => p.id === DEFAULT_ALIAS_OF)?.label ?? "Default")},`,
    ...presets.map((p) => `  ${JSON.stringify(p.id)}: ${JSON.stringify(p.label)},`),
    "}",
    "",
    "/** Canon tokens written per preset per mode; the panel's source line quotes it. */",
    `export const THEME_TOKEN_COUNT = ${tokenCount}`,
    "",
  ]
  writeFileSync(OUT_PRESETS, lines.join("\n"))
  console.log(`wrote ${OUT_PRESETS}`)
}

/**
 * Two next/font/google calls, or none. See src/lib/theme/fonts.ts for WHY this file is
 * generated instead of being a twelve-entry map: the loaders run at build time, so a
 * module holding all twelve emits all twelve into the bundle.
 */
function writeFontsModule() {
  const target = OUT_DIR_OVERRIDE ? join(OUT_DIR_OVERRIDE, "fonts.generated.ts") : OUT_FONTS
  const pair = readProfileFontPair()
  const header = [
    "// GENERATED by scripts/build-themes.mjs (pnpm themes:build) — do not edit.",
    "// Only the ACTIVE profile's pair is instantiated; see src/lib/theme/fonts.ts.",
    "",
  ]
  if (!pair) {
    writeFileSync(
      target,
      [
        ...header,
        "// No profile font pair: the storefront keeps the typography it already had.",
        'export const fontClassName = ""',
        "export const activeFonts: { display: string; body: string } | null = null",
        "",
      ].join("\n")
    )
    console.log(`wrote ${target} (no profile fonts; typography unchanged)`)
    return
  }

  const { FONT_LOADERS, FONT_VARIABLES, FONT_STATIC_WEIGHTS, assertFontName } = loadFontAllowList()
  assertFontName(pair.display, "profile.theme.typography.display")
  assertFontName(pair.body, "profile.theme.typography.body")
  const loaders = [...new Set([FONT_LOADERS[pair.display], FONT_LOADERS[pair.body]])]
  const opts = (name, variable) => {
    const parts = ['subsets: ["latin"]', 'display: "swap"', `variable: ${JSON.stringify(variable)}`]
    // a family with no variable axis is refused by next/font/google without a weight
    const w = FONT_STATIC_WEIGHTS[name]
    if (w) parts.push(`weight: [${w.split(",").map((x) => JSON.stringify(x.trim())).join(", ")}]`)
    return `{ ${parts.join(", ")} }`
  }
  writeFileSync(
    target,
    [
      ...header,
      `import { ${loaders.join(", ")} } from "next/font/google"`,
      "",
      `const display = ${FONT_LOADERS[pair.display]}(${opts(pair.display, FONT_VARIABLES.display)})`,
      `const body = ${FONT_LOADERS[pair.body]}(${opts(pair.body, FONT_VARIABLES.body)})`,
      "",
      "export const fontClassName = `${display.variable} ${body.variable}`",
      `export const activeFonts = ${JSON.stringify(pair)} as const`,
      "",
    ].join("\n")
  )
  console.log(`wrote ${target} (${pair.display} / ${pair.body})`)
}

/** The profile's font pair, defensively: an absent or theme-less profile means null. */
function readProfileFontPair() {
  let profile
  try {
    profile = JSON.parse(readFileSync(PROFILE_JSON, "utf8"))
  } catch {
    return null
  }
  const t = profile?.theme?.typography
  if (typeof t?.display === "string" && typeof t?.body === "string") {
    return { display: t.display, body: t.body }
  }
  return null
}

/**
 * fonts.ts is TypeScript, and this script is plain node. Rather than duplicate the
 * allow-list (the exact drift the file warns about), read it out of the source: the
 * three exports we need are literal data, so a tiny parse beats a build step.
 */
function loadFontAllowList() {
  const src = readFileSync(join(STOREFRONT, "src/lib/theme/fonts.ts"), "utf8")
  const grab = (name) => {
    const start = src.indexOf(`export const ${name}`)
    if (start < 0) fail(`fonts.ts no longer exports ${name}`)
    const open = src.indexOf("{", start)
    let depth = 0
    for (let i = open; i < src.length; i++) {
      if (src[i] === "{") depth++
      else if (src[i] === "}") {
        depth--
        if (depth === 0) return src.slice(open, i + 1)
      }
    }
    fail(`fonts.ts: ${name} is not a closed object literal`)
  }
  const toObject = (literal) => {
    const out = {}
    const re = /(?:"([^"]+)"|([A-Za-z_$][\w$]*))\s*:\s*"([^"]*)"/g
    let m
    while ((m = re.exec(literal))) out[m[1] ?? m[2]] = m[3]
    return out
  }
  const FONT_LOADERS = toObject(grab("FONT_LOADERS"))
  const FONT_VARIABLES = toObject(grab("FONT_VARIABLES"))
  const FONT_STATIC_WEIGHTS = toObject(grab("FONT_STATIC_WEIGHTS"))
  const names = Object.keys(FONT_LOADERS)
  if (names.length !== 12) fail(`fonts.ts FONT_LOADERS has ${names.length} entries, expected 12`)
  const assertFontName = (name, where) => {
    if (!names.includes(name)) {
      fail(`${where}: "${name}" is not one of the twelve allow-listed fonts (${names.join(", ")})`)
    }
  }
  return { FONT_LOADERS, FONT_VARIABLES, FONT_STATIC_WEIGHTS, assertFontName }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch (e) {
    fail(`cannot read ${path}: ${e.message}`)
  }
}

function fail(message) {
  console.error(`themes:build failed — ${message}`)
  process.exit(1)
}

main()
