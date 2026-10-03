import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import resolveConfig from "tailwindcss/resolveConfig"
import { describe, expect, it } from "vitest"

import tailwindConfig from "../../../tailwind.config.js"

const SRC = join(__dirname, "../..")

// t-theme-hardcoded-colours (2026-10-03): the stand's literal-colour count went
// 176 -> 0 once (5be7487e, t-store-profiles-pilot) and quietly drifted back up to 42
// across 25 files because nothing ran this check. This test is that check.
//
// A literal Tailwind palette colour never passes review here again: repaint it onto
// a theme token (`text-ui-fg-error`, `bg-[var(--success)]`, …) or, for a colour that
// must hold regardless of the shop's theme (a brand mark, a QR backdrop), add a
// `// theme-colours allowlist: <reason>` comment on the line immediately above it.

const PALETTE = "white|black|gray|slate|zinc|neutral|stone|red|rose|green|emerald|blue|sky|indigo|amber|yellow|orange|purple|violet|pink"
const LITERAL_COLOUR_RE = new RegExp(
  `(?:^|[\\s"'\`{(:,])((?:bg|text|border|ring|fill|stroke|from|to|via)-(?:${PALETTE})(?:-[0-9]+)?)(?=[\\s"'\`})/,]|$)`,
  "g"
)
const ALLOWLIST_MARKER = "theme-colours allowlist"

// The marker may sit on the flagged line itself, or anywhere in the block of `//`
// comment lines directly above it (a one-line reason can spill onto a second line).
function isAllowlisted(lines: string[], i: number): boolean {
  if (lines[i].includes(ALLOWLIST_MARKER)) return true
  for (let j = i - 1; j >= 0 && /^\s*\/\//.test(lines[j]); j--) {
    if (lines[j].includes(ALLOWLIST_MARKER)) return true
  }
  return false
}

// t-theme-hardcoded-colours review (telegram-login-a5, PR #224): a `ui-*` token that
// merely LOOKS plausible (`bg-ui-tag-red-bg0`) is syntactically fine and parses clean,
// but @medusajs/ui-preset emits no rule for it — the colour silently disappears. The
// only honest check is the one Tailwind itself does: resolve the project's own
// tailwind.config.js and read back the colours it actually produced.
const resolvedColours = resolveConfig(tailwindConfig as never).theme.colors as Record<string, unknown>

function collectLeaves(node: unknown, prefix: string, out: Set<string>) {
  if (typeof node === "string") {
    out.add(prefix)
    return
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "DEFAULT") {
        collectLeaves(value, prefix, out)
      } else {
        collectLeaves(value, prefix ? `${prefix}-${key}` : key, out)
      }
    }
  }
}

const VALID_UI_SUFFIXES = new Set<string>()
collectLeaves((resolvedColours as { ui?: unknown }).ui, "", VALID_UI_SUFFIXES)

const UI_TOKEN_RE = /(?:bg|text|border|ring|fill|stroke|shadow)-ui-([a-z][a-z0-9-]*)/g

function listTsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    const st = statSync(abs)
    if (st.isDirectory()) {
      if (name === "node_modules") continue
      out.push(...listTsxFiles(abs))
    } else if (/\.tsx$/.test(name) && !/\.(test|spec)\.tsx$/.test(name)) {
      out.push(abs)
    }
  }
  return out
}

describe("theme tokens: no literal Tailwind colour comes back unnoticed", () => {
  const files = listTsxFiles(SRC)

  it("has 0 literal Tailwind palette colours outside the allowlist", () => {
    const offenders: string[] = []
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n")
      lines.forEach((line, i) => {
        LITERAL_COLOUR_RE.lastIndex = 0
        if (!LITERAL_COLOUR_RE.test(line)) return
        if (isAllowlisted(lines, i)) return
        offenders.push(`${file.slice(SRC.length + 1)}:${i + 1}: ${line.trim()}`)
      })
    }
    expect(offenders, offenders.join("\n")).toEqual([])
  })

  it("every ui-* token used actually exists in the resolved Tailwind config", () => {
    expect(VALID_UI_SUFFIXES.size, "resolved 0 ui-* colours — tailwind.config.js or the preset is broken").toBeGreaterThan(0)
    const offenders: string[] = []
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n")
      lines.forEach((line, i) => {
        for (const match of Array.from(line.matchAll(UI_TOKEN_RE))) {
          const suffix = match[1]
          if (VALID_UI_SUFFIXES.has(suffix)) continue
          offenders.push(`${file.slice(SRC.length + 1)}:${i + 1}: ui-${suffix} (from "${match[0]}") — ${line.trim()}`)
        }
      })
    }
    expect(offenders, offenders.join("\n")).toEqual([])
  })

  it("has a themed focus-visible replacement for every outline-none", () => {
    const offenders: string[] = []
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n")
      lines.forEach((line, i) => {
        if (!/outline-none/.test(line)) return
        const hasReplacement = /focus-visible:ring|focus-visible:shadow-borders|focus-visible:outline/.test(line)
        if (hasReplacement) return
        if (isAllowlisted(lines, i)) return
        offenders.push(`${file.slice(SRC.length + 1)}:${i + 1}: ${line.trim()}`)
      })
    }
    expect(offenders, offenders.join("\n")).toEqual([])
  })
})
