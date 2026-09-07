// T-fix repaint gate. Runs ONCE, after all repaint zones return. No builds, no installs.
// Usage: node apps/storefront/scripts/theme-repaint-gate.mjs <worktree-root>
// This is a PARSE, not a type check: it catches a broken class string or JSX, not a type error.
// 1) literal-colour + focus-ring counts   2) syntactic parse of every changed TS/TSX/JS
// 3) CSS brace balance   4) diff-shape: every class-token delta must be literal -> token
import { execFileSync } from "node:child_process"
import { readFileSync, existsSync } from "node:fs"
import { createRequire } from "node:module"

const W = process.argv[2] || process.cwd()   // repo/worktree root; pass it explicitly when running from elsewhere
const SRC = W + "/apps/storefront/src"
const require_ = createRequire(import.meta.url)
const TS_PATH = process.env.TS_PATH || "/Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.js"
const ts = require_(TS_PATH)   // TypeScript from wherever it IS installed: this worktree has no node_modules

const LITERAL = /^(?:[a-z0-9-]+:)*(?:bg|text|border|ring|fill|stroke|from|to|via)-(?:white|black|neutral-\d+|gray-\d+|grey-\d+|zinc-\d+|slate-\d+|stone-\d+)(?:\/\d+)?$/
const ALLOWED = /^(?:[a-z0-9-]+:)*(?:(?:bg|text|border|ring|fill|stroke|shadow)-ui-[a-z0-9-]+|(?:bg|text|border|ring|from|to|via|fill|stroke)-\[var\(--[a-z0-9-]+\)\]|ring-[0-9]|ring-inset|outline-none)(?:\/\d+)?$/

const git = (...a) => execFileSync("git", ["-C", W, ...a], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
const sh = (cmd) => { try { return execFileSync("bash", ["-c", cmd], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }) } catch (e) { return (e.stdout || "") } }

const out = []
const say = (s) => { out.push(s); console.log(s) }

// ---------- 1. counts ----------
const grepRe = "(bg|text|border|ring|fill|stroke|from|to|via)-(white|black|neutral-[0-9]+|gray-[0-9]+|grey-[0-9]+|zinc-[0-9]+|slate-[0-9]+|stone-[0-9]+)"
const nLit = sh(`cd ${SRC} && grep -roE "${grepRe}" . | wc -l`).trim()
const nOutline = sh(`cd ${SRC} && grep -roE 'outline-none' . | wc -l`).trim()
const nRing = sh(`cd ${SRC} && grep -roE 'focus-visible:ring' . | wc -l`).trim()
say(`## counts (baseline was 176 / 18 / 4)`)
say(`literal colour occurrences : ${nLit}`)
say(`outline-none               : ${nOutline}`)
say(`focus-visible:ring         : ${nRing}`)
say(`gate A (literals == 0)     : ${Number(nLit) === 0 ? "PASS" : "FAIL"}`)
say(`gate B (outline <= ring)   : ${Number(nOutline) <= Number(nRing) ? "PASS" : "FAIL"}`)
if (Number(nLit) > 0) say(sh(`cd ${SRC} && grep -rnoE "${grepRe}" . | head -40`))

// ---------- 2. changed files ----------
const changed = git("diff", "--name-only").split("\n").filter(Boolean)
const untracked = git("ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean)
say(`\n## changed files: ${changed.length} tracked, ${untracked.length} untracked`)
if (untracked.length) say(`UNTRACKED (agents should have created nothing):\n  ${untracked.join("\n  ")}`)

// ---------- 3. syntactic parse ----------
say(`\n## syntactic parse (typescript ${ts.version}, JSX enabled — this is a PARSE, not a type check)`)
let parseFails = 0
for (const f of changed) {
  const abs = W + "/" + f
  if (!existsSync(abs)) { say(`  MISSING ${f}`); parseFails++; continue }
  if (/\.(tsx?|jsx?|mjs|cjs)$/.test(f)) {
    const src = readFileSync(abs, "utf8")
    const sf = ts.createSourceFile(abs, src, ts.ScriptTarget.Latest, true,
      /\.tsx$/.test(f) ? ts.ScriptKind.TSX : /\.jsx$/.test(f) ? ts.ScriptKind.JSX : /\.ts$/.test(f) ? ts.ScriptKind.TS : ts.ScriptKind.JS)
    const d = sf.parseDiagnostics || []
    if (d.length) {
      parseFails++
      say(`  FAIL ${f}: ${d.slice(0, 3).map((x) => `${ts.flattenDiagnosticMessageText(x.messageText, " ")} @${x.start}`).join(" | ")}`)
    }
  } else if (/\.css$/.test(f)) {
    const s = readFileSync(abs, "utf8")
    const open = (s.match(/\{/g) || []).length, close = (s.match(/\}/g) || []).length
    if (open !== close) { parseFails++; say(`  FAIL ${f}: brace imbalance ${open} { vs ${close} }`) }
  }
}
say(`parse failures: ${parseFails} — ${parseFails === 0 ? "PASS" : "FAIL"}`)

// ---------- 4. diff shape ----------
say(`\n## diff shape — every class-token delta must be (literal colour) -> (token utility)`)
const tokens = (line) => line.replace(/^[+-]/, "").split(/[\s"'`]+/).map((t) => t.replace(/^[,;{}()]+|[,;]+$/g, "")).filter((t) => t.length > 1)
let shapeFlags = 0
const perFile = []
for (const f of changed) {
  if (!/^apps\/storefront\/src\/.*\.(tsx?|jsx?)$/.test(f)) continue
  const diff = git("diff", "-U0", "--", f)
  const hunks = diff.split(/^@@.*$/m).slice(1)
  for (const h of hunks) {
    const rem = [], add = []
    for (const l of h.split("\n")) {
      if (l.startsWith("-") && !l.startsWith("---")) rem.push(...tokens(l))
      else if (l.startsWith("+") && !l.startsWith("+++")) add.push(...tokens(l))
    }
    const cnt = (arr) => arr.reduce((m, t) => (m[t] = (m[t] || 0) + 1, m), {})
    const a = cnt(rem), b = cnt(add)
    const removedOnly = Object.keys(a).filter((t) => (a[t] - (b[t] || 0)) > 0)
    const addedOnly = Object.keys(b).filter((t) => (b[t] - (a[t] || 0)) > 0)
    const badRemoved = removedOnly.filter((t) => !LITERAL.test(t))
    const badAdded = addedOnly.filter((t) => !ALLOWED.test(t))
    if (badRemoved.length || badAdded.length) {
      shapeFlags++
      perFile.push(`  FLAG ${f}\n    unexpected removed: ${badRemoved.join(" ") || "-"}\n    unexpected added  : ${badAdded.join(" ") || "-"}`)
    }
  }
}
say(perFile.join("\n") || "  (no flags)")
say(`hunks with a non-colour delta: ${shapeFlags} — ${shapeFlags === 0 ? "PASS" : "REVIEW"}`)

// ---------- 5. non-tsx diffs, printed for human reading ----------
say(`\n## non-JSX diffs (read these by eye)`)
for (const f of changed) if (!/^apps\/storefront\/src\/.*\.(tsx?|jsx?)$/.test(f)) say(git("diff", "--", f))

say(`\n## diffstat`)
say(git("diff", "--stat"))
