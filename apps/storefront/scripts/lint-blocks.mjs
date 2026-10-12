#!/usr/bin/env node
// The block lint of the template programme (t-2026-10-12-33, docs/templates/BLOCK-CONTRACT.md §4): the
// design-docs ui-lint (19 detectors behind the `rule-*` elements of
// ~/upready/projects/design-docs/registry/ds-elements.json, written by tools/migrate-ui-lint-rules.mjs there)
// run over the block folder, plus the contract checks it does not make on this codebase. Any error OR warning
// fails: a block is new code and starts clean.
//
//   node scripts/lint-blocks.mjs [<dir|file> …]     default: src/modules/blocks
//
// ui-lint is `~/upready/tools/ui-lint.js`, a zero-dependency Node script outside this repository; set
// UI_LINT_PATH to use another copy. Without it this script exits 2 and says so: no ui-lint, no pass.
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const storefront = path.resolve(here, "..")
const targets = process.argv.slice(2).length ? process.argv.slice(2) : [path.join(storefront, "src/modules/blocks")]

const uiLint = process.env.UI_LINT_PATH || path.join(os.homedir(), "upready/tools/ui-lint.js")
if (!fs.existsSync(uiLint)) {
  console.error(
    `lint:blocks cannot run: ui-lint is not at ${uiLint}. It lives in the upready tools, outside this ` +
      "repository; set UI_LINT_PATH to its path. Nothing was checked, so this is not a pass."
  )
  process.exit(2)
}

/* ------------------------------------------------------------------ ui-lint */

let report
try {
  report = JSON.parse(execFileSync(process.execPath, [uiLint, "--json", ...targets], { encoding: "utf8" }))
} catch (error) {
  // ui-lint exits 1 when it finds an error; its JSON is still on stdout.
  if (error.stdout) report = JSON.parse(error.stdout)
  else throw error
}

const findings = report.violations.map((v) => ({
  source: "ui-lint",
  rule: v.rule,
  severity: v.severity,
  file: v.file,
  line: v.line,
  match: v.match,
  why: v.description,
}))

/* ------------------------------------------------------------------ the contract's own checks */

// What ui-lint misses on this storefront: a hex inside a Tailwind arbitrary value (`bg-[#fff]`), rgb()/hsl()
// literals, ad-hoc shadows, the bare white/black utilities and icon sets other than lucide-react (this
// storefront's own `@medusajs/icons` included: BLOCK-CONTRACT.md §3).
const CONTRACT = [
  { rule: "contract-hex", pattern: /(?<![\w&/])#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/g, why: "A colour literal: use a theme variable (var(--primary), var(--border) …) or a ui-* token class." },
  { rule: "contract-colour-function", pattern: /\b(?:rgba?|hsla?|oklch)\(\s*\d/g, why: "A colour literal: use a theme variable." },
  { rule: "contract-adhoc-shadow", pattern: /\bshadow-\[|\bboxShadow\b|box-shadow\s*:/g, why: "An ad-hoc shadow: use the preset's var(--shadow-card|float|modal) or none." },
  { rule: "contract-white-black", pattern: /\b(?:bg|border|ring|fill|stroke|from|via|to)-(?:white|black)\b/g, why: "White and black do not follow the theme: use a token." },
  // `shared/block-icon` and `shared/icon-name` are the blocks' own lucide wrapper and its names.
  { rule: "contract-icons", pattern: /from\s+["'](?!lucide-react["']|(?:\.\.?\/)+(?:shared\/)?(?:block-icon|icon-name)["']|@modules\/blocks\/shared\/)[^"']*icons?[^"']*["']/g, why: "Icons come from lucide-react only." },
  // §3: one size per role on a page (QR-TYPE-ROLE), so a section heading takes the shell's type.
  { rule: "contract-section-type", pattern: /<h2\b(?![^>]*\bSECTION_TYPE\.heading\b)/g, why: "A section heading takes its classes from shared/section-type: className={SECTION_TYPE.heading}." },
  // §3: the density layer picks steps on the space scale (QR-SPACE-SCALE); a multiple of a step falls off it.
  // `--layer-density` is left for a height (`min-h-[calc(18rem*var(--layer-density,1))]`), which the scale does not hold.
  { rule: "contract-density-step", pattern: /(?<!\b(?:min-|max-)?h-\[[^\]\s"']*)--layer-density\b|calc\([^\]"'\s]*--layer-space-/g, why: "A block never multiplies a space: take the step token, py-[var(--layer-space-8,2rem)] where you would write py-8. --layer-density is for a height (min-h) alone." },
]

const walk = (target) => {
  const stat = fs.statSync(target)
  if (stat.isFile()) return [target]
  return fs.readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(target, entry.name)
    if (entry.isDirectory()) return ["node_modules", ".next"].includes(entry.name) ? [] : walk(full)
    return /\.(tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : []
  })
}

const stripComments = (code) =>
  code.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'])\/\/.*$/gm, "$1")

const files = targets.flatMap(walk)
for (const file of files) {
  const code = stripComments(fs.readFileSync(file, "utf8"))
  for (const check of CONTRACT) {
    for (const match of code.matchAll(check.pattern)) {
      const line = code.slice(0, match.index).split("\n").length
      findings.push({ source: "contract", rule: check.rule, severity: "error", file, line, match: match[0], why: check.why })
    }
  }
}

/* ------------------------------------------------------------------ verdict */

const failing = findings.filter((f) => f.severity === "error" || f.severity === "warning")
const rel = (file) => path.relative(storefront, file)
for (const f of findings) {
  console.log(`${f.severity.padEnd(7)} ${rel(f.file)}:${f.line}  ${f.rule}  ${f.match}  — ${f.why}`)
}
console.log(
  `lint:blocks: ${files.length} files (ui-lint read ${report.files} .tsx), ${failing.length} failing, ` +
    `${findings.length - failing.length} info — ${failing.length ? "FAIL" : "pass"}`
)
process.exit(failing.length ? 1 : 0)
