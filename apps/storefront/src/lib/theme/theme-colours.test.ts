import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import postcss, { type AcceptedPlugin } from "postcss"
import tailwindcss from "tailwindcss"
import resolveConfig from "tailwindcss/resolveConfig"
import { describe, expect, it } from "vitest"

import tailwindConfig from "../../../tailwind.config.js"

const SRC = join(__dirname, "../..")

// t-theme-hardcoded-colours (2026-10-03, widened 2026-10-05): the stand's literal-colour count
// went 176 -> 0 once (5be7487e, t-store-profiles-pilot) and quietly drifted back up to 42 because
// nothing ran this check. The first version of this test looked at palette classes in `.tsx` only,
// so 221 hex and rgb() literals in SVG attributes, `style` objects and CSS modules (the h7 header,
// the cart pill, the field rings) stayed out of its sight. This one reads every `.ts`, `.tsx` and
// `.css` file under src.
//
// A literal colour never passes review here again: paint with a theme token (`text-ui-fg-error`,
// `bg-status-error-bg`, `var(--border)`, …). A colour that must hold whatever the shop's theme (a
// brand mark, a mask, a photo scrim) carries `theme-colours allowlist: <reason>` in a comment on
// its line or in the comment block directly above it, or sits in a file listed in FILE_ALLOWLIST.

const ALLOWLIST_MARKER = "theme-colours allowlist"
const REASON_RE = /theme-colours allowlist:\s*(\S.{9,})/

// Whole files whose hex and rgb() literals are allowed, each with its reason. Only literal values
// are covered: a palette class, a `dark:` variant or a bare `outline-none` in these files still
// fails. An entry whose file is gone or holds no literal any more fails too, so the list cannot rot.
const FILE_ALLOWLIST: Record<string, string> = {
  "modules/order/components/transfer-image/index.tsx":
    "brand graphic: the order-transfer illustration draws its own greys (lead, 2026-10-05)",
  "modules/common/icons/github.tsx": "brand graphic: GitHub's coloured mark with its gradient",
  "modules/checkout/components/pochta-map/index.tsx":
    "brand graphic: Russian Post's blue and red markers on a raster map that follows no theme",
  "modules/home/variants/olavka-navigation.tsx":
    "brand graphic: cherkashino.com category chips from the mockup, each a self-contained fill and ink pair",
  "modules/home/variants/olavka-navigation.module.css":
    "brand graphic: the default pair of the same category chips and their highlight",
  "modules/home/variants/olavka-hero-slider.module.css":
    "brand graphic: chips and frames drawn over slide photos, the chip variant is chosen per slide",
  "modules/account/components/yandex-login/yandex-id-button.tsx":
    "brand graphic: Yandex ID's own button constructor, its logo red and avatar grey",
  "app/pricing/pricing.module.css": "the upready platform's pricing page, not a shop storefront: it reads no shop theme",
  "app/pricing/icons.tsx": "the upready platform's pricing page, not a shop storefront: it reads no shop theme",
  "app/start/demo.module.css": "the upready platform's /start funnel, not a shop storefront: it reads no shop theme",
  "modules/studio/styles/panel.css":
    "the owner's studio panel keeps its own chrome so it stays legible over any preset it previews",
}

const PALETTES =
  "white|black|grey|gray|slate|zinc|neutral|stone|red|rose|green|emerald|blue|sky|indigo|amber|yellow|orange|purple|violet|pink|teal|cyan|lime|fuchsia"
const COLOUR_PREFIX =
  "bg|text|border(?:-[xytblrse])?|ring(?:-offset)?|outline|divide|placeholder|fill|stroke|from|via|to|shadow|decoration|caret|accent"
const PALETTE_RE = new RegExp(
  `(?<![\\w-])(?:[\\w\\[\\]&>:*=().-]+:)*!?(?:${COLOUR_PREFIX})-(?:${PALETTES})(?:-\\d+)?(?:\\/(?:\\d+|\\[[^\\]]+\\]))?(?![\\w-])`,
  "g"
)
const LITERAL_RE = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])|\b(?:rgba?|hsla?)\(/g
const DARK_VARIANT_RE = /(?<![\w-])dark:[\w[!-]/
const UI_TOKEN_RE = /(?:bg|text|border|ring|fill|stroke|shadow|from|via|to|divide|outline|placeholder|accent)-ui-([a-z][a-z0-9-]*)/g
// Error, success and warning paint from the `status-*` colours (tailwind.config.js), which read the
// preset's own --destructive / --success / --warning. The `ui-tag-*` ramps behind these three names
// are the Medusa tag palette, bridged to the preset's chart colours: on supplements the "red" error
// banner was grey (--chart-4 #b8b8b8).
const STATUS_TAG_RE = /ui-tag-(?:red|orange|green)-/

type SourceFile = { rel: string; ext: "ts" | "tsx" | "css"; lines: string[]; code: string[]; commentOnly: boolean[] }

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    if (statSync(abs).isDirectory()) {
      if (name !== "node_modules") listSourceFiles(abs, out)
    } else if (/\.(tsx?|css)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) && !/\.d\.ts$/.test(name)) {
      out.push(abs)
    }
  }
  return out
}

// Splits a file into lines twice: as written (where the allowlist marker is looked for) and as code
// with every comment blanked out, so a colour named in a comment is never read as paint.
function readSource(abs: string): SourceFile {
  const text = readFileSync(abs, "utf8")
  const ext = abs.endsWith(".css") ? "css" : abs.endsWith(".tsx") ? "tsx" : "ts"
  // A block comment opens at a line start, after `{` (JSX) or after a space: `accept="image/*"` is a string.
  let blanked = text.replace(/(^|[\s{(,;])\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  if (ext !== "css") blanked = blanked.replace(/(^|[^:"'`\w])\/\/[^\n]*/g, (m, lead: string) => lead + " ".repeat(m.length - lead.length))
  const lines = text.split("\n")
  const code = blanked.split("\n")
  const commentOnly = lines.map((line, i) => line.trim() !== "" && /^[\s{}]*$/.test(code[i]))
  return { rel: abs.slice(SRC.length + 1), ext, lines, code, commentOnly }
}

// The marker counts on the flagged line itself or anywhere in the run of comment-only lines directly
// above it (a reason may spill over several lines). A marker without a reason is not a marker.
function allowlistState(file: SourceFile, i: number): "allowed" | "no-reason" | "none" {
  const candidates = [i]
  for (let j = i - 1; j >= 0 && file.commentOnly[j]; j--) candidates.push(j)
  for (const j of candidates) {
    if (!file.lines[j].includes(ALLOWLIST_MARKER)) continue
    // The reason may continue on the next comment line, so read the marker's line and the one after.
    const window = `${file.lines[j]} ${file.commentOnly[j + 1] ? file.lines[j + 1] : ""}`.replace(/\s*(\*\/|\*|\/\/|\{\/\*|\*\/\})\s*/g, " ")
    return REASON_RE.test(window) ? "allowed" : "no-reason"
  }
  return "none"
}

const files = listSourceFiles(SRC).map(readSource)

function offendersFor(test: (file: SourceFile, code: string, i: number) => string | null) {
  const out: string[] = []
  for (const file of files) {
    file.code.forEach((code, i) => {
      const hit = test(file, code, i)
      if (!hit) return
      const state = allowlistState(file, i)
      if (state === "allowed") return
      const note = state === "no-reason" ? " (allowlist marker without a reason)" : ""
      out.push(`${file.rel}:${i + 1}: ${hit}${note} — ${file.lines[i].trim()}`)
    })
  }
  return out
}

describe("theme tokens: no literal colour comes back unnoticed", () => {
  // The detectors themselves, on the shapes a new literal arrives in. A detector that silently
  // stopped matching would leave every check below green over a tree full of literals.
  it("the detectors catch what they claim to", () => {
    const palette = ["hover:bg-gray-100", "bg-white/50", "!text-black", "border-x-zinc-200", "bg-grey-10", "md:group-hover:text-slate-500", "shadow-black/[0.1]"]
    for (const sample of palette) expect(`"${sample}"`.match(PALETTE_RE), sample).not.toBeNull()
    for (const sample of ["bg-ui-bg-base", "text-ui-fg-muted", "bg-transparent", "text-current", "bg-status-error-bg"])
      expect(`"${sample}"`.match(PALETTE_RE), sample).toBeNull()
    for (const sample of ['fill="#52525B"', "color: #fff;", "rgba(0, 0, 0, 0.12)", "bg-[#767676]", "hsl(0 0% 50%)"])
      expect(sample.match(LITERAL_RE), sample).not.toBeNull()
    for (const sample of ['href="#add-to-cart"', "&#123;", "color-mix(in srgb, var(--x) 8%, transparent)", "#content"])
      expect(sample.match(LITERAL_RE), sample).toBeNull()
    expect(DARK_VARIANT_RE.test('"dark:bg-white"')).toBe(true)
    expect(DARK_VARIANT_RE.test('data-mode="dark"')).toBe(false)
    const code = readSource(join(SRC, "lib/theme/theme-colours.test.ts"))
    expect(code.commentOnly.some(Boolean), "comment lines were not recognised").toBe(true)
  })

  it("reads the source tree", () => {
    expect(files.length, "listed no source files — SRC moved?").toBeGreaterThan(300)
  })

  it("has 0 literal Tailwind palette colours outside the allowlist", () => {
    const offenders = offendersFor((_f, code) => code.match(PALETTE_RE)?.join(", ") ?? null)
    expect(offenders, offenders.join("\n")).toEqual([])
  })

  it("has 0 hex, rgb() or hsl() literals outside the allowlist", () => {
    const offenders = offendersFor((file, code) => {
      // src/lib/**/*.ts builds data, not paint: the web manifest, favicons, the brand-colour
      // pipeline. A `.tsx` there still renders and stays in scope.
      if (file.ext === "ts" && file.rel.startsWith("lib/")) return null
      if (file.rel === "styles/themes.css") return null // generated by `pnpm themes:build`, it IS the tokens
      if (FILE_ALLOWLIST[file.rel]) return null
      return code.match(LITERAL_RE)?.join(", ") ?? null
    })
    expect(offenders, offenders.join("\n")).toEqual([])
  })

  it("keeps every FILE_ALLOWLIST entry real: the file exists and still holds a literal", () => {
    const stale: string[] = []
    for (const [rel, reason] of Object.entries(FILE_ALLOWLIST)) {
      expect(reason.length, `${rel}: an allowlisted file needs a reason`).toBeGreaterThan(10)
      const file = files.find((f) => f.rel === rel)
      if (!existsSync(join(SRC, rel)) || !file) {
        stale.push(`${rel}: no such source file`)
        continue
      }
      if (!file.code.some((code) => new RegExp(LITERAL_RE.source).test(code))) stale.push(`${rel}: holds no literal colour any more`)
    }
    expect(stale, stale.join("\n")).toEqual([])
  })

  it("has no dark: variant: a mode is painted by tokens that switch on data-mode", () => {
    const offenders = offendersFor((_f, code) => (DARK_VARIANT_RE.test(code) ? "dark: variant" : null))
    expect(offenders, offenders.join("\n")).toEqual([])
  })

  it("paints error, success and warning from status-* rather than the ui-tag chart ramps", () => {
    const offenders = offendersFor((file, code) =>
      file.ext !== "css" && STATUS_TAG_RE.test(code) ? "ui-tag-red/orange/green" : null
    )
    expect(offenders, offenders.join("\n")).toEqual([])
  })

  it("has a themed focus replacement for every outline-none", () => {
    const offenders = offendersFor((file, code) => {
      if (file.ext === "css") return /outline:\s*(?:none|0)\b/.test(code) ? "outline: none" : null
      if (!/(?<![\w-])outline-none(?![\w-])/.test(code)) return null
      return /(?:focus-visible|focus-within|focus):(?:ring|shadow|outline)/.test(code) ? null : "outline-none with no ring"
    })
    expect(offenders, offenders.join("\n")).toEqual([])
  })

  // t-theme-hardcoded-colours review (telegram-login-a5, PR #224): a `ui-*` token that merely
  // LOOKS plausible (`bg-ui-tag-red-bg0`) parses clean, but @medusajs/ui-preset emits no rule for
  // it and the colour silently disappears. Resolve the project's own config and read back the
  // colours it actually produced.
  it("every ui-* token used actually exists in the resolved Tailwind config", () => {
    const resolved = resolveConfig(tailwindConfig as never).theme as Record<string, Record<string, unknown>>
    const valid = new Set<string>()
    const collect = (node: unknown, prefix: string) => {
      if (typeof node === "string") valid.add(prefix)
      else if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
          collect(value, key === "DEFAULT" ? prefix : prefix ? `${prefix}-${key}` : key)
        }
      }
    }
    collect(resolved.colors.ui, "")
    expect(valid.size, "resolved 0 ui-* colours — tailwind.config.js or the preset is broken").toBeGreaterThan(50)
    const offenders: string[] = []
    for (const file of files) {
      if (file.ext === "css") continue
      file.code.forEach((code, i) => {
        for (const match of Array.from(code.matchAll(UI_TOKEN_RE))) {
          if (!valid.has(match[1])) offenders.push(`${file.rel}:${i + 1}: ui-${match[1]} (from "${match[0]}")`)
        }
      })
    }
    expect(offenders, offenders.join("\n")).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------
// Error, success and warning come from the preset's own tokens, in every preset and both modes.
// ---------------------------------------------------------------------------------------------

type Rgb = [number, number, number]

function parseColour(value: string): Rgb {
  const v = value.trim()
  const hex = v.match(/^#([0-9a-f]{6})$/i)
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as Rgb
  const rgb = v.match(/^rgba?\(([^)]+)\)$/)
  if (rgb) return rgb[1].split(",").slice(0, 3).map(Number) as Rgb
  throw new Error(`cannot read colour "${value}"`)
}

// Evaluates the subset of CSS the status colours are written in: var(--x) and
// color-mix(in srgb, A p%, B). sRGB mixing is per-channel on the encoded values, as the spec has it.
function evaluate(expr: string, vars: Record<string, string>): Rgb {
  const e = expr.trim()
  const ref = e.match(/^var\(--([\w-]+)\)$/)
  if (ref) {
    if (!vars[ref[1]]) throw new Error(`--${ref[1]} is not declared`)
    return evaluate(vars[ref[1]], vars)
  }
  const mix = e.match(/^color-mix\(in srgb,\s*(var\(--[\w-]+\))\s+([\d.]+)%,\s*(var\(--[\w-]+\))\)$/)
  if (mix) {
    const [a, p, b] = [evaluate(mix[1], vars), Number(mix[2]) / 100, evaluate(mix[3], vars)]
    return a.map((c, i) => c * p + b[i] * (1 - p)) as Rgb
  }
  return parseColour(e)
}

const luminance = (c: Rgb) => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function presetCells(): Record<string, Record<string, string>> {
  const css = readFileSync(join(SRC, "styles/themes.css"), "utf8")
  const cells: Record<string, Record<string, string>> = {}
  for (const m of Array.from(css.matchAll(/((?:\[data-theme="[a-z-]+"\]\[data-mode="(?:light|dark)"\],?\s*)+)\{([^}]*)\}/g))) {
    const vars: Record<string, string> = {}
    for (const d of Array.from(m[2].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g))) vars[d[1]] = d[2]
    if (!vars.background) continue // the contrast-ink blocks further down carry no palette
    for (const s of Array.from(m[1].matchAll(/data-theme="([a-z-]+)"\]\[data-mode="(light|dark)"/g))) {
      cells[`${s[1]}/${s[2]}`] = vars
    }
  }
  return cells
}

describe("status colours: error, success and warning follow every preset", () => {
  const cells = presetCells()
  const status = (resolveConfig(tailwindConfig as never).theme.colors as Record<string, Record<string, string>>).status

  it("finds both modes of every preset in themes.css", () => {
    const themes = new Set(Object.keys(cells).map((k) => k.split("/")[0]))
    expect(themes.size, "no preset blocks parsed from styles/themes.css").toBeGreaterThan(5)
    for (const theme of Array.from(themes)) {
      expect(cells[`${theme}/light`], `${theme} has no light block`).toBeDefined()
      expect(cells[`${theme}/dark`], `${theme} has no dark block`).toBeDefined()
    }
  })

  it("every preset declares --destructive, --success and --warning in both modes", () => {
    const missing = Object.entries(cells).flatMap(([cell, vars]) =>
      ["destructive", "success", "warning"].filter((t) => !vars[t]).map((t) => `${cell}: --${t}`)
    )
    expect(missing, missing.join("\n")).toEqual([])
  })

  it("status-* reads only the preset's status, page and ink tokens", () => {
    expect(status, "tailwind.config.js lost theme.extend.colors.status").toBeDefined()
    expect(status.error).toBe("var(--destructive)")
    expect(status.success).toBe("var(--success)")
    expect(status.warning).toBe("var(--warning)")
    for (const [name, value] of Object.entries(status)) {
      const vars = Array.from(value.matchAll(/var\(--([\w-]+)\)/g)).map((m) => m[1])
      expect(vars.length, `status-${name} names no token`).toBeGreaterThan(0)
      for (const v of vars) expect(["destructive", "success", "warning", "background", "foreground"], `status-${name}`).toContain(v)
      expect(value, `status-${name} carries a literal`).not.toMatch(new RegExp(LITERAL_RE.source))
    }
  })

  // WCAG 2.1: 4.5:1 for text (1.4.3), 3:1 for an icon or a dot that carries meaning (1.4.11).
  // A raw --warning is a light orange on several presets (geist light #f5a623 on white, 2.03:1),
  // which is why warning icons take the warning ink and only error and success icons the raw token.
  it("clears WCAG contrast in every preset and mode", () => {
    const failures: string[] = []
    for (const [cell, vars] of Object.entries(cells)) {
      const page = evaluate("var(--background)", vars)
      for (const kind of ["error", "success", "warning"] as const) {
        const ink = evaluate(status[`${kind}-text`], vars)
        const tint = evaluate(status[`${kind}-bg`], vars)
        const checks: [string, number, number][] = [
          [`status-${kind}-text on status-${kind}-bg`, contrast(ink, tint), 4.5],
          [`status-${kind}-text on the page`, contrast(ink, page), 4.5],
        ]
        if (kind !== "warning") {
          const raw = evaluate(status[kind], vars)
          checks.push([`status-${kind} icon on the page`, contrast(raw, page), 3], [`status-${kind} icon on status-${kind}-bg`, contrast(raw, tint), 3])
        }
        for (const [what, ratio, min] of checks) if (ratio < min) failures.push(`${cell}: ${what} ${ratio.toFixed(2)}:1 < ${min}:1`)
      }
    }
    expect(failures, failures.join("\n")).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------
// The trap the registry calls D-darkmode-selector-mismatch: with darkMode "class" every dark:
// utility compiled into CSS no element could ever match, because the presets switch on
// [data-mode]. The source holds no dark: variant now (above); this keeps the config able to serve
// one the day an allowlisted case needs it.
// ---------------------------------------------------------------------------------------------
describe("dark mode: the Tailwind dark variant follows data-mode", () => {
  it("is configured on the [data-mode=\"dark\"] selector", () => {
    expect((tailwindConfig as { darkMode: unknown }).darkMode).toEqual(["selector", '[data-mode="dark"]'])
  })

  it("compiles a dark: utility under [data-mode=\"dark\"]", async () => {
    const config = { ...(tailwindConfig as object), content: [{ raw: '<p class="dark:text-ui-fg-base"></p>', extension: "html" }] }
    // tailwindcss ships its own postcss (8.5.6) types next to the storefront's (8.5.22): the two
    // Plugin types do not unify, so the plugin goes in as the storefront's own type.
    const plugin = tailwindcss(config as never) as unknown as AcceptedPlugin
    const { css } = await postcss([plugin]).process("@tailwind utilities;", { from: undefined })
    const rule = css.split("}").find((block) => block.includes("dark\\:text-ui-fg-base"))
    expect(rule, "the dark: utility was not generated at all").toBeDefined()
    expect(rule).toContain('[data-mode="dark"]')
  }, 30000)
})
