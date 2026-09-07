#!/usr/bin/env node
/**
 * Regenerates the three vendor-derived spec files of the theme bridge:
 *
 *   specs/design-system/token-map.json          — one row per @medusajs/ui-preset variable
 *   specs/design-system/themes/medusa.theme.json — canon token values read out of the preset
 *   specs/design-system/themes/geist.theme.json  — canon token values read out of geist-kit
 *
 * Nothing here is typed by hand except the SEMANTIC table below: every colour value
 * is read from the installed preset (`dist/index.js`, through the plugin's own
 * `addBase` calls, so we get exactly what Tailwind would emit) and from
 * `~/upready/packages/geist-kit/theme.css`. `node_modules` is never written to.
 *
 * The mix percentages of the `diverged` rows are SOLVED, not guessed: for each row
 * and EACH MODE the script searches blend partner × 0…100 % for the value closest to
 * the vendor one, and records the residual channel error it could not remove
 * (`medusaResidual`). That number is the honest cost of expressing a Medusa
 * variable in the canon vocabulary — the pixel test in tests/theme is what decides
 * whether it is affordable.
 *
 * Solving per mode is not a nicety: Medusa builds its light ramp out of opaque greys
 * and its dark ramp out of white-at-low-alpha overlays (--bg-field is rgb(250,250,250)
 * in light and rgba(255,255,255,0.04) in dark). No single blend reaches both, so a row
 * whose two modes disagree emits a second declaration under [data-mode="dark"].
 *
 * Run:  node apps/storefront/scripts/extract-theme-sources.mjs
 */

import { createRequire } from "node:module"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const HERE = dirname(fileURLToPath(import.meta.url))
const STOREFRONT = resolve(HERE, "..")
const REPO = resolve(STOREFRONT, "../..")
const GEIST_KIT = process.env.GEIST_KIT_DIR || resolve(process.env.HOME, "upready/packages/geist-kit")

/* ------------------------------------------------------------------ vendor read */

/** Runs the preset's Tailwind plugin with a stub Tailwind API and collects `addBase`. */
function readMedusaPreset() {
  const entry = require.resolve("@medusajs/ui-preset", { paths: [STOREFRONT] })
  const preset = require(entry)
  const plugin = preset.plugins.find((p) => typeof (p.handler || p) === "function")
  const blocks = []
  ;(plugin.handler || plugin)({
    addBase: (o) => blocks.push(o),
    addComponents: () => {},
    addUtilities: () => {},
    // apps/storefront/tailwind.config.js sets darkMode: "class", so mirror that branch:
    // the plugin then emits `.dark { ... }` instead of a prefers-color-scheme block. The
    // VALUES are the same object either way (colors.dark + effects.dark).
    config: (k, d) => (k === "darkMode" ? "class" : d),
    theme: (_k, d) => d,
    e: (x) => x,
  })
  const light = {}
  const dark = {}
  for (const b of blocks) {
    for (const [sel, decls] of Object.entries(b)) {
      if (sel === ":root") Object.assign(light, pickVars(decls))
      else if (sel === ".dark") Object.assign(dark, pickVars(decls))
      else if (sel.startsWith("@media") && decls[":root"]) Object.assign(dark, pickVars(decls[":root"]))
    }
  }
  const version = require(require.resolve("@medusajs/ui-preset/package.json", { paths: [STOREFRONT] })).version
  return { light, dark, version, entry }
}

function pickVars(decls) {
  const out = {}
  for (const [k, v] of Object.entries(decls)) if (k.startsWith("--")) out[k] = String(v)
  return out
}

/** Reads the `:root` and `.dark` custom properties of geist-kit/theme.css. */
function readGeistKit() {
  const file = join(GEIST_KIT, "theme.css")
  const css = readFileSync(file, "utf8")
  const block = (selector) => {
    const start = css.indexOf(`${selector} {`)
    if (start < 0) throw new Error(`geist-kit/theme.css has no ${selector} block`)
    const end = css.indexOf("\n}", start)
    return css.slice(start, end)
  }
  const vars = (text) => {
    const out = {}
    const re = /^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gm
    let m
    while ((m = re.exec(text))) out[m[1]] = m[2].replace(/\/\*[\s\S]*$/, "").trim()
    return out
  }
  return { light: vars(block(":root")), dark: vars(block(".dark")) }
}

/* ------------------------------------------------------- the one authored table */

/**
 * canon token -> where its MEDUSA value comes from.
 * A string is the name of a preset variable whose value is copied verbatim;
 * `{ light, dark }` names one per mode; `{ literal }` is a value with no preset
 * counterpart at all (only --radius, which Medusa expresses as Tailwind utilities).
 */
const CANON_FROM_MEDUSA = {
  "--radius": { literal: "0.5rem" }, // Medusa's rounded-lg (8px), the storefront's dominant corner
  "--background": "--bg-base",
  "--foreground": "--fg-base",
  "--card": "--bg-base",
  "--card-foreground": "--fg-base",
  "--popover": "--bg-base",
  "--popover-foreground": "--fg-base",
  "--primary": "--button-inverted",
  "--primary-foreground": "--fg-on-inverted",
  "--secondary": "--bg-subtle",
  "--secondary-foreground": "--fg-base",
  "--muted": "--bg-base-hover",
  // Medusa has THREE ink levels (base 24,24,27 / subtle 82,82,91 / muted 113,113,122)
  // and the canon has two. The second anchor goes to the one that is used most, because
  // the residual of a diverged ink row lands on every antialiased glyph edge it paints:
  // measured in src/**, text-ui-fg-base 167 call sites, text-ui-fg-subtle 117,
  // text-ui-fg-muted 39. So --fg-subtle is exact. --fg-muted USED to carry the residual
  // as a blend toward the page; it is exact too now, for the AA reason written on its
  // BRIDGE row below.
  "--muted-foreground": "--fg-subtle",
  "--accent": "--bg-base-hover",
  "--accent-foreground": "--fg-base",
  "--destructive": "--fg-error",
  // the ink that sits on a saturated or inverted surface; white in both Medusa modes
  "--destructive-foreground": "--fg-on-color",
  "--border": "--border-base",
  "--input": "--border-base",
  "--ring": "--border-interactive",
  // NOT the vendor --fg-interactive: the storefront has always shipped a WCAG-corrected
  // blue (globals.css, blue-600 = 5.17:1 on white where blue-500 reaches only 3.67:1).
  // Baking it here is what turns that override from a special case into a preset value.
  "--link": { light: "rgba(37, 99, 235, 1)", dark: "@--fg-interactive" },
  "--success": "--tag-green-text",
  "--warning": "--tag-orange-text",
  "--chart-1": "--tag-blue-icon",
  "--chart-2": "--tag-green-icon",
  "--chart-3": "--tag-purple-icon",
  "--chart-4": "--tag-red-icon",
  "--chart-5": "--tag-orange-icon",
  "--shadow-card": "--elevation-card-rest",
  "--shadow-float": "--elevation-flyout",
  "--shadow-modal": "--elevation-modal",
}

/**
 * What apps/storefront/src/styles/globals.css has always overridden on top of the
 * vendor preset. These are the values the storefront ACTUALLY renders today, so they —
 * not the vendor ones — are the baseline a bridge row has to reproduce, and they are
 * what the four-page pixel test compares against. The override moves into the preset
 * files (--link) and disappears from globals.css; the rows stay ordinary rows.
 *
 * Medusa's default --fg-interactive (blue-500) reaches only 3.67:1 on white, below the
 * 4.5:1 WCAG AA threshold for body text; blue-600 reaches 5.17:1.
 */
const STOREFRONT_OVERRIDE = {
  light: {
    "--fg-interactive": "rgba(37, 99, 235, 1)",
    "--fg-interactive-hover": "rgba(29, 78, 216, 1)",
  },
  dark: {},
}

/**
 * preset variable -> how it is expressed in the canon vocabulary.
 *   { canon }            the canon token this variable follows; `mapped` when the
 *                        values are already identical in both modes, otherwise the
 *                        script blends it with `with` and calls the row `diverged`
 *   { canon, with }      blend partner: 'bg' | 'fg' | 'transparent' | 'black' | 'white'
 *   { canon, exact }     follow the canon token verbatim even though the vendor value
 *                        differs; `exact` is the reason, and it is recorded on the row
 *   { open: reason }     no canon counterpart; the row keeps the vendor value
 */
const BRIDGE = {
  /* --- surfaces ------------------------------------------------------------- */
  "--bg-base": { canon: "--background" },
  "--bg-base-hover": { canon: "--accent" },
  "--bg-base-pressed": { canon: "--accent", with: "fg" },
  "--bg-subtle": { canon: "--secondary" },
  "--bg-subtle-hover": { canon: "--secondary", with: "fg" },
  "--bg-subtle-pressed": { canon: "--secondary", with: "fg" },
  "--bg-component": { canon: "--secondary", with: "bg" },
  "--bg-component-hover": { canon: "--accent", with: "bg" },
  "--bg-component-pressed": { canon: "--accent", with: "fg" },
  "--bg-field": { canon: "--secondary", with: "bg" },
  "--bg-field-hover": { canon: "--accent", with: "bg" },
  "--bg-field-component": { canon: "--background" },
  "--bg-field-component-hover": { canon: "--secondary", with: "bg" },
  "--bg-disabled": { canon: "--accent" },
  "--bg-highlight": { canon: "--link", with: "bg" },
  "--bg-highlight-hover": { canon: "--link", with: "bg" },
  "--bg-interactive": { canon: "--ring" },
  "--bg-overlay": { open: "a scrim that stays dark in both modes; canon has no scrim token" },
  "--bg-switch-off": { canon: "--accent", with: "fg" },
  "--bg-switch-off-hover": { canon: "--accent", with: "fg" },

  /* --- ink ------------------------------------------------------------------ */
  "--fg-base": { canon: "--foreground" },
  "--fg-subtle": { canon: "--muted-foreground" },
  // NOT blended toward the background any more. The fit reproduced Medusa's own
  // #71717a, and that grey is below AA on the preset palettes: measured 2026-09-08 on
  // the sneakers stand, 4.28:1 light and 3.65:1 dark against --background, 54 of the 64
  // failing text nodes of the coverage gate. Any percentage under 100 can only move the
  // ink TOWARD the page, so no global blend is safe across nine presets — the only
  // theme-proof foreground is the one the preset itself chose. This collapses Medusa's
  // three ink levels onto the canon's two: --fg-subtle and --fg-muted now resolve to the
  // same colour. Restoring a third step means lifting --fg-subtle toward --foreground
  // (contrast can only rise), which is a design call, not an accessibility one.
  "--fg-muted": { canon: "--muted-foreground", exact: "AA on the preset background: the fitted blend reproduced Medusa's #71717a, measured 4.28:1 light / 3.65:1 dark on the sneakers stand 2026-09-08" },
  "--fg-disabled": { canon: "--muted-foreground", with: "bg" },
  "--fg-on-color": { canon: "--destructive-foreground" },
  "--fg-on-inverted": { canon: "--primary-foreground" },
  "--fg-interactive": { canon: "--link" },
  "--fg-interactive-hover": { canon: "--link", with: "fg" },
  "--fg-error": { canon: "--destructive" },

  /* --- borders -------------------------------------------------------------- */
  "--border-base": { canon: "--border" },
  "--border-strong": { canon: "--border", with: "fg" },
  "--border-interactive": { canon: "--ring" },
  "--border-danger": { canon: "--destructive", with: "black" },
  "--border-error": { canon: "--destructive" },
  "--border-transparent": { open: "a literal zero-alpha colour, not a themeable value" },
  "--border-menu-top": { canon: "--border", with: "bg" },
  "--border-menu-bot": { canon: "--background", with: "transparent" },

  /* --- inverted surfaces (tooltip, command bar) ------------------------------ */
  "--contrast-bg-base": { open: "inverted-surface ramp: dark in BOTH modes, canon --primary flips polarity" },
  "--contrast-bg-base-hover": { open: "inverted-surface ramp, see --contrast-bg-base" },
  "--contrast-bg-base-pressed": { open: "inverted-surface ramp, see --contrast-bg-base" },
  "--contrast-bg-subtle": { open: "inverted-surface ramp, see --contrast-bg-base" },
  "--contrast-border-top": { open: "inverted-surface ramp, see --contrast-bg-base" },
  "--contrast-border-bot": { open: "inverted-surface ramp, see --contrast-bg-base" },
  "--contrast-border-base": { open: "inverted-surface ramp, see --contrast-bg-base: the surface is FIXED dark in both modes, so its foreground must be fixed too — following canon --destructive-foreground makes it flip to the preset ink and vanish (cause E, measured 2026-09-08)" },
  "--contrast-fg-primary": { open: "inverted-surface ramp, see --contrast-bg-base: the surface is FIXED dark in both modes, so its foreground must be fixed too — following canon --destructive-foreground makes it flip to the preset ink and vanish (cause E, measured 2026-09-08)" },
  "--contrast-fg-secondary": { open: "inverted-surface ramp, see --contrast-bg-base: the surface is FIXED dark in both modes, so its foreground must be fixed too — following canon --destructive-foreground makes it flip to the preset ink and vanish (cause E, measured 2026-09-08)" },

  /* --- button fills --------------------------------------------------------- */
  "--button-inverted": { canon: "--primary" },
  "--button-inverted-hover": { canon: "--primary", with: "bg" },
  "--button-inverted-pressed": { canon: "--primary", with: "bg" },
  "--button-neutral": { canon: "--background" },
  "--button-neutral-hover": { canon: "--accent" },
  "--button-neutral-pressed": { canon: "--accent", with: "fg" },
  "--button-transparent": { canon: "--background", with: "transparent" },
  "--button-transparent-hover": { canon: "--accent" },
  "--button-transparent-pressed": { canon: "--accent", with: "fg" },
  "--button-danger": { canon: "--destructive" },
  "--button-danger-hover": { canon: "--destructive", with: "black" },
  "--button-danger-pressed": { canon: "--destructive", with: "black" },

  /* --- alphas --------------------------------------------------------------- */
  "--alpha-250": { canon: "--foreground", with: "transparent" },
  "--alpha-400": { canon: "--foreground", with: "transparent" },

  /* --- tags ----------------------------------------------------------------- */
  "--tag-neutral-bg": { canon: "--accent", with: "bg" },
  "--tag-neutral-bg-hover": { canon: "--accent", with: "fg" },
  "--tag-neutral-border": { canon: "--border", with: "bg" },
  "--tag-neutral-icon": { canon: "--muted-foreground", with: "bg" },
  "--tag-neutral-text": { canon: "--muted-foreground", with: "fg" },
  "--tag-blue-icon": { canon: "--chart-1" },
  "--tag-blue-text": { canon: "--chart-1", with: "fg" },
  "--tag-blue-bg": { canon: "--chart-1", with: "bg" },
  "--tag-blue-bg-hover": { canon: "--chart-1", with: "bg" },
  "--tag-blue-border": { canon: "--chart-1", with: "bg" },
  "--tag-green-icon": { canon: "--chart-2" },
  "--tag-green-text": { canon: "--success" },
  "--tag-green-bg": { canon: "--chart-2", with: "bg" },
  "--tag-green-bg-hover": { canon: "--chart-2", with: "bg" },
  "--tag-green-border": { canon: "--chart-2", with: "bg" },
  "--tag-purple-icon": { canon: "--chart-3" },
  "--tag-purple-text": { canon: "--chart-3", with: "fg" },
  "--tag-purple-bg": { canon: "--chart-3", with: "bg" },
  "--tag-purple-bg-hover": { canon: "--chart-3", with: "bg" },
  "--tag-purple-border": { canon: "--chart-3", with: "bg" },
  "--tag-red-icon": { canon: "--chart-4" },
  "--tag-red-text": { canon: "--chart-4", with: "fg" },
  "--tag-red-bg": { canon: "--chart-4", with: "bg" },
  "--tag-red-bg-hover": { canon: "--chart-4", with: "bg" },
  "--tag-red-border": { canon: "--chart-4", with: "bg" },
  "--tag-orange-icon": { canon: "--chart-5" },
  "--tag-orange-text": { canon: "--warning" },
  "--tag-orange-bg": { canon: "--chart-5", with: "bg" },
  "--tag-orange-bg-hover": { canon: "--chart-5", with: "bg" },
  "--tag-orange-border": { canon: "--chart-5", with: "bg" },

  /* --- effects (box-shadow stacks) ------------------------------------------ */
  "--elevation-card-rest": { canon: "--shadow-card" },
  "--elevation-flyout": { canon: "--shadow-float" },
  "--elevation-modal": { canon: "--shadow-modal" },
  "--elevation-card-hover": { open: "multi-layer shadow stack; canon carries three shadows, not seven" },
  "--elevation-tooltip": { open: "multi-layer shadow stack, see --elevation-card-hover" },
  "--elevation-code-block": { open: "multi-layer shadow stack, see --elevation-card-hover" },
  "--elevation-commandbar": { open: "multi-layer shadow stack, see --elevation-card-hover" },
  "--buttons-neutral": { open: "button shadow stack with a baked hairline; canon has no button elevation" },
  "--buttons-neutral-focus": { open: "button shadow stack, see --buttons-neutral" },
  "--buttons-inverted": { open: "button shadow stack, see --buttons-neutral" },
  "--buttons-inverted-focus": { open: "button shadow stack, see --buttons-neutral" },
  "--buttons-danger": { open: "button shadow stack, see --buttons-neutral" },
  "--buttons-danger-focus": { open: "button shadow stack, see --buttons-neutral" },
  "--borders-base": { open: "focus/border shadow stack with a baked focus blue; canon has no focus ring stack" },
  "--borders-error": { open: "focus/border shadow stack, see --borders-base" },
  "--borders-focus": { open: "focus/border shadow stack, see --borders-base" },
  "--borders-interactive-with-focus": { open: "focus/border shadow stack, see --borders-base" },
  "--borders-interactive-with-shadow": { open: "focus/border shadow stack, see --borders-base" },
  "--borders-interactive-with-active": { open: "focus/border shadow stack, see --borders-base" },
  "--details-switch-background": { open: "switch shadow stack, see --borders-base" },
  "--details-switch-background-focus": { open: "switch shadow stack, see --borders-base" },
  "--details-switch-handle": { open: "switch shadow stack, see --borders-base" },
  "--details-contrast-on-bg-interactive": { open: "switch shadow stack, see --borders-base" },
}

/* ------------------------------------------------------------------ colour math */

function parseColor(v) {
  const s = String(v).trim()
  let m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/i)
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] }
  m = s.match(/^#([0-9a-f]{6})$/i)
  if (m) {
    const n = parseInt(m[1], 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
  }
  m = s.match(/^#([0-9a-f]{3})$/i)
  if (m) {
    const [x, y, z] = m[1].split("")
    return { r: parseInt(x + x, 16), g: parseInt(y + y, 16), b: parseInt(z + z, 16), a: 1 }
  }
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 }
  return null // shadows, lengths, anything not a colour
}

/** CSS `color-mix(in srgb, A p%, B)` — premultiplied alpha, per spec. */
function mixSrgb(A, B, p) {
  const wa = p / 100
  const wb = 1 - wa
  const a = A.a * wa + B.a * wb
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 }
  const ch = (k) => (A[k] * A.a * wa + B[k] * B.a * wb) / a
  return { r: ch("r"), g: ch("g"), b: ch("b"), a }
}

/** Largest single-channel error (0-255 scale, alpha counted on the same scale). */
function residual(x, target) {
  if (!x || !target) return null
  return Math.max(
    Math.abs(x.r - target.r),
    Math.abs(x.g - target.g),
    Math.abs(x.b - target.b),
    Math.abs(x.a - target.a) * 255
  )
}

const PARTNER_EXPR = {
  bg: "var(--background)",
  fg: "var(--foreground)",
  transparent: "transparent",
  black: "#000",
  white: "#fff",
}

/* -------------------------------------------------------------------- generate */

function main() {
  const medusa = readMedusaPreset()
  const geist = readGeistKit()
  const presetVars = Object.keys(medusa.light)

  // --- canon token values for the medusa preset, read out of the preset ---
  const medusaCanon = { light: {}, dark: {} }
  for (const [canon, src] of Object.entries(CANON_FROM_MEDUSA)) {
    for (const mode of ["light", "dark"]) {
      let spec = src
      if (typeof spec === "object" && spec.literal !== undefined) {
        medusaCanon[mode][canon] = spec.literal
        continue
      }
      if (typeof spec === "object") spec = spec[mode]
      if (typeof spec === "string" && spec.startsWith("@")) spec = spec.slice(1)
      else if (typeof spec === "string" && !spec.startsWith("--")) {
        medusaCanon[mode][canon] = spec // an inline literal for this mode
        continue
      }
      const value = STOREFRONT_OVERRIDE[mode][spec] ?? medusa[mode][spec]
      if (value === undefined) throw new Error(`${canon}: preset has no ${spec} in ${mode}`)
      medusaCanon[mode][canon] = value
    }
  }

  // --- canon token values for the geist preset ---
  // geist-kit's .dark block only redeclares what changes; the preset schema wants the
  // same key set in both modes, so light fills the gaps (that is what the cascade does).
  const geistCanon = {
    light: { ...geist.light },
    dark: { ...geist.light, ...geist.dark },
  }
  for (const k of Object.keys(geistCanon.light)) {
    if (!(k in CANON_FROM_MEDUSA)) throw new Error(`geist-kit declares ${k}, which the medusa preset does not cover`)
  }
  for (const k of Object.keys(CANON_FROM_MEDUSA)) {
    if (!(k in geistCanon.light)) throw new Error(`CANON_FROM_MEDUSA has ${k}, which geist-kit/theme.css does not declare`)
  }

  // --- one bridge row per preset variable ---
  const rows = []
  const counts = { mapped: 0, diverged: 0, open: 0 }
  for (const name of presetVars) {
    const spec = BRIDGE[name]
    if (!spec) throw new Error(`BRIDGE has no row for ${name} — the preset gained a variable`)
    const vendor = { light: medusa.light[name], dark: medusa.dark[name] }
    // what the page renders today = vendor + the storefront's own :root override
    const effective = {
      light: STOREFRONT_OVERRIDE.light[name] ?? vendor.light,
      dark: STOREFRONT_OVERRIDE.dark[name] ?? vendor.dark,
    }
    const overridden = effective.light !== vendor.light || effective.dark !== vendor.dark

    if (spec.open) {
      rows.push({ variable: name, canonToken: null, status: "open", bridge: null, vendor, effective, reason: spec.open })
      counts.open++
      continue
    }

    const canonValue = { light: medusaCanon.light[spec.canon], dark: medusaCanon.dark[spec.canon] }
    const identical = canonValue.light === effective.light && canonValue.dark === effective.dark
    // `exact` follows the canon token even where the vendor value differs — a deliberate
    // break with Medusa's palette, and the row records why. The reproduce-the-vendor rule
    // is the default because it keeps today's look; it is not a rule worth reproducing a
    // WCAG failure for.
    if (identical || spec.exact) {
      rows.push({
        variable: name,
        canonToken: spec.canon,
        status: "mapped",
        bridge: `${name}: var(${spec.canon});`,
        vendor,
        effective,
        storefrontOverride: overridden || undefined,
        exact: spec.exact || undefined,
      })
      counts.mapped++
      continue
    }

    // diverged: solve the blend per mode (see the header note on Medusa's two ramps)
    const hint = spec.with || "bg"
    const light = solveMix(spec.canon, effective.light, hint, medusaCanon.light)
    const dark = solveMix(spec.canon, effective.dark, hint, medusaCanon.dark)
    const expr = (s) => `color-mix(in srgb, var(${s.canon}) ${s.pct}%, ${PARTNER_EXPR[s.with]})`
    const sameInBothModes = light.canon === dark.canon && light.with === dark.with && light.pct === dark.pct
    rows.push({
      variable: name,
      canonToken: spec.canon,
      status: "diverged",
      bridge: `${name}: ${expr(light)};`,
      bridgeDark: sameInBothModes ? null : `${name}: ${expr(dark)};`,
      derivation: {
        kind: "color-mix",
        space: "srgb",
        canon: spec.canon,
        light: { canon: light.canon, pct: light.pct, with: PARTNER_EXPR[light.with] },
        dark: { canon: dark.canon, pct: dark.pct, with: PARTNER_EXPR[dark.with] },
      },
      vendor,
      effective,
      storefrontOverride: overridden || undefined,
      medusaResidual: { light: round(light.residual), dark: round(dark.residual) },
    })
    counts.diverged++
  }

  const tokenMap = {
    schema: "upready.token-map/v0",
    dictionary: "geist-kit/theme.css",
    source: `@medusajs/ui-preset@${medusa.version} dist/index.js :root + @media (prefers-color-scheme: dark) :root`,
    generatedBy: "apps/storefront/scripts/extract-theme-sources.mjs",
    counts: { presetVariables: presetVars.length, ...counts },
    canonTokens: Object.keys(CANON_FROM_MEDUSA),
    canonFromMedusa: CANON_FROM_MEDUSA,
    rows,
  }

  write(join(REPO, "specs/design-system/token-map.json"), tokenMap)
  write(join(REPO, "specs/design-system/themes/medusa.theme.json"), {
    schema: "upready.theme-preset/v0",
    id: "medusa",
    label: "Medusa default",
    description:
      "Today's storefront look, written in the canon vocabulary. Values read out of the installed @medusajs/ui-preset, except --link, which carries the storefront's WCAG-corrected blue.",
    dictionary: "geist-kit/theme.css",
    source: `@medusajs/ui-preset@${medusa.version} dist/index.js :root/.dark`,
    modes: { light: { tokens: medusaCanon.light }, dark: { tokens: medusaCanon.dark } },
  })
  write(join(REPO, "specs/design-system/themes/geist.theme.json"), {
    schema: "upready.theme-preset/v0",
    id: "geist",
    label: "Geist",
    description:
      "Vendor copy of the canon palette (~/upready/packages/geist-kit/theme.css). Dark repeats the tokens geist-kit leaves to the cascade, because the preset schema requires the same key set in both modes.",
    dictionary: "geist-kit/theme.css",
    source: `geist-kit@${geistCommit()}`,
    modes: { light: { tokens: geistCanon.light }, dark: { tokens: geistCanon.dark } },
  })

  console.log(`preset variables: ${presetVars.length}`)
  console.log(`mapped: ${counts.mapped}  diverged: ${counts.diverged}  open: ${counts.open}`)
  const worst = rows
    .filter((r) => r.medusaResidual)
    .sort((a, b) => Math.max(b.medusaResidual.light ?? 0, b.medusaResidual.dark ?? 0) - Math.max(a.medusaResidual.light ?? 0, a.medusaResidual.dark ?? 0))
    .slice(0, 8)
  console.log("worst diverged residuals (max channel error out of 255, light/dark):")
  for (const r of worst) console.log(`  ${r.variable.padEnd(34)} ${r.medusaResidual.light} / ${r.medusaResidual.dark}`)
  console.log(`canon tokens: ${Object.keys(CANON_FROM_MEDUSA).length}`)
}

/**
 * Canon anchors a diverged row may fall back to when its authored anchor cannot reach
 * the vendor value in a given mode. Medusa's dark ramp is built from white-at-low-alpha
 * overlays, so a row anchored on a dark surface token (--secondary is rgb(24,24,27) in
 * dark) has no percentage that reaches rgba(255,255,255,0.04); --foreground does.
 * The authored anchor is kept unless an alternative removes at least ANCHOR_GAIN of
 * channel error, so the semantic choice is only overridden when the numbers demand it.
 */
const FALLBACK_ANCHORS = ["--foreground", "--background", "--muted-foreground", "--border", "--primary", "--destructive"]
const ANCHOR_GAIN = 8

/**
 * One mode, one row: search canon anchor × blend partner × percentage for the closest
 * value. Only theme-following partners are searched unless the row's `with` hint names
 * a fixed colour — a bridge that blends with #000 stops following the preset, so that
 * partner is used solely where the authored table asked for it.
 */
function solveMix(authoredCanon, vendorValue, hint, canonOfMode) {
  const target = parseColor(vendorValue)
  if (!target) return { canon: authoredCanon, pct: 100, with: hint, residual: null } // shadow stacks: no colour maths

  const partners = [...new Set([hint, "bg", "fg", "transparent"])]
  const search = (canon) => {
    const A = parseColor(canonOfMode[canon])
    if (!A) return null
    let best = null
    for (const key of partners) {
      const B = parseColor(partnerValue(key, canonOfMode))
      if (!B) continue
      for (let pct = 0; pct <= 100; pct += 0.5) {
        const err = residual(mixSrgb(A, B, pct), target)
        // prefer the hinted partner and the higher percentage on a tie, so the row keeps
        // as much of the canon token as the numbers allow
        const better =
          !best ||
          err < best.residual - 1e-9 ||
          (Math.abs(err - best.residual) < 1e-9 && key === hint && best.with !== hint)
        if (better) best = { canon, pct, with: key, residual: err }
      }
    }
    return best
  }

  const authored = search(authoredCanon)
  let best = authored
  for (const alt of FALLBACK_ANCHORS) {
    if (alt === authoredCanon) continue
    const candidate = search(alt)
    if (candidate && candidate.residual < best.residual - ANCHOR_GAIN) best = candidate
  }
  return best
}

function partnerValue(key, canonOfMode) {
  if (key === "bg") return canonOfMode["--background"]
  if (key === "fg") return canonOfMode["--foreground"]
  if (key === "transparent") return "transparent"
  if (key === "black") return "#000"
  if (key === "white") return "#fff"
  throw new Error(`unknown blend partner ${key}`)
}

function round(x) {
  return x === null ? null : Math.round(x * 100) / 100
}

function geistCommit() {
  const { execFileSync } = require("node:child_process")
  return execFileSync("git", ["-C", GEIST_KIT, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim()
}

function write(path, json) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n")
  console.log(`wrote ${path}`)
}

main()
