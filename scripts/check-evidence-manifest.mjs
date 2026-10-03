#!/usr/bin/env node
/**
 * Screenshots under docs/evidence come from stands, and a stand restored from a
 * copy of the live database shows real buyers: names under reviews, addresses,
 * phones, order numbers. Once such a file is pushed it sits in every clone and
 * only a history rewrite takes it out (t-2026-10-03-59 found eight and painted
 * them over in place). This check keeps the next one out of a pull request.
 *
 * An image or screen recording that the change adds or modifies under
 * docs/evidence/<task>/ passes only with an entry in docs/evidence/<task>/EVIDENCE.yml:
 *
 *   shots/after-home-1440.webp:
 *     source: обезличенная база upready_store_anon_14
 *     sha256: <sha256 of the file>
 *
 * An added file needs a source that starts with «обезличенная база <name>». A
 * modified file may carry `redacted: <task>, <what was painted over>` instead,
 * which is how a screenshot already in git is cleaned in place. Every entry of
 * every manifest must name an existing file with that exact sha256, so swapping
 * the bytes without touching the manifest fails too. The rule and the format are
 * in docs/evidence/README.md.
 *
 *   node scripts/check-evidence-manifest.mjs                    # pnpm check:evidence
 *   node scripts/check-evidence-manifest.mjs --base FETCH_HEAD  # what pr-checks.yml runs
 *
 * The base is --base, else EVIDENCE_BASE, else origin/dev. The comparison runs
 * from the merge base to the working tree, untracked files included. A shallow
 * pull-request checkout has no merge base, and there the base tip itself is the
 * right side to compare: the checked-out merge commit is that tip plus the change.
 *
 * Exit 0 when everything is declared, 1 otherwise. The output names paths and
 * reasons, never anything read from an image.
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const EVIDENCE = "docs/evidence/"
const MANIFEST = "EVIDENCE.yml"
const MEDIA = /\.(png|jpe?g|webp|gif|avif|bmp|tiff?|heic|mp4|webm|mov)$/i
const ANONYMIZED = /^обезличенная база \S+/
const KEYS = new Set(["source", "sha256", "redacted"])

const argv = process.argv.slice(2)
const option = (name) => {
  const at = argv.indexOf(name)
  return at >= 0 ? argv[at + 1] : undefined
}
const root = path.resolve(
  option("--root") ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."),
)
const base = option("--base") ?? process.env.EVIDENCE_BASE ?? "origin/dev"

const fail = (message) => {
  console.error(`check-evidence-manifest: ${message}`)
  process.exit(1)
}
const git = (...args) =>
  execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })

/**
 * A strict subset of YAML that this script reads itself, so the check needs no
 * install: a top-level `<path>:` line opens an entry, `  <key>: <value>` lines
 * with exactly two spaces fill it. A value never holds ": " or " #", which keeps
 * the file valid YAML for any other reader.
 */
function parseManifest(text, file) {
  const entries = new Map()
  const errors = []
  let current = null
  text.split("\n").forEach((raw, index) => {
    const line = raw.replace(/\r$/, "")
    const at = `${file}:${index + 1}`
    if (!line.trim() || /^\s*#/.test(line)) return
    const head = /^([^\s#:][^:]*):$/.exec(line)
    if (head) {
      if (entries.has(head[1])) errors.push(`${at}: ${head[1]} is listed twice`)
      current = {}
      entries.set(head[1], current)
      return
    }
    const field = /^ {2}([a-z0-9_]+): (\S.*)$/.exec(line)
    if (field && current) {
      const [, key, value] = field
      if (!KEYS.has(key)) errors.push(`${at}: unknown key "${key}" (allowed: ${[...KEYS].join(", ")})`)
      else if (key in current) errors.push(`${at}: "${key}" is set twice`)
      else if (/: | #|^["'&*!|>%@`{[]/.test(value)) errors.push(`${at}: keep the value plain, without ": ", " #" or a leading quote`)
      else current[key] = value.trim()
      return
    }
    errors.push(`${at}: expected "<path>:" or "  <key>: <value>"`)
  })
  return { entries, errors }
}

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex")

try {
  git("rev-parse", "--is-inside-work-tree")
} catch {
  fail(`${root} is not a git checkout`)
}
try {
  git("rev-parse", "--verify", "--quiet", `${base}^{commit}`)
} catch {
  fail(`base "${base}" is not a commit here; fetch it or pass --base <ref>`)
}
let from = base
try {
  from = git("merge-base", base, "HEAD").trim()
} catch {
  // shallow checkout of a pull-request merge commit: compare against the base tip
}

/** path -> "added" | "modified", for media files the change brings in under docs/evidence */
const changed = new Map()
const fields = git("diff", "--name-status", "-z", "-M", "--diff-filter=ACMR", from, "--", "docs/evidence")
  .split("\0")
  .filter(Boolean)
for (let index = 0; index < fields.length; ) {
  const status = fields[index]
  const renamed = /^[RC]/.test(status)
  const file = renamed ? fields[index + 2] : fields[index + 1]
  index += renamed ? 3 : 2
  changed.set(file, status === "M" ? "modified" : "added")
}
for (const file of git("ls-files", "--others", "--exclude-standard", "-z", "--", "docs/evidence").split("\0")) {
  if (file) changed.set(file, "added")
}
for (const file of changed.keys()) {
  if (!MEDIA.test(file) || !file.startsWith(EVIDENCE)) changed.delete(file)
}

const problems = []
const manifests = new Map()
const evidenceDir = path.join(root, EVIDENCE)
const taskDirs = existsSync(evidenceDir)
  ? readdirSync(evidenceDir).filter((name) => statSync(path.join(evidenceDir, name)).isDirectory())
  : []
let entryCount = 0

for (const task of taskDirs) {
  const rel = `${EVIDENCE}${task}/${MANIFEST}`
  const file = path.join(root, rel)
  if (!existsSync(file)) continue
  const { entries, errors } = parseManifest(readFileSync(file, "utf8"), rel)
  manifests.set(task, entries)
  problems.push(...errors)
  for (const [key, entry] of entries) {
    entryCount += 1
    const target = path.join(root, EVIDENCE, task, key)
    const named = `${EVIDENCE}${task}/${key}`
    if (!MEDIA.test(key)) problems.push(`${rel}: ${key} is not an image or a recording`)
    else if (!existsSync(target)) problems.push(`${rel}: ${key} does not exist; drop the entry or restore the file`)
    else if (!entry.sha256) problems.push(`${rel}: ${key} has no sha256`)
    else if (entry.sha256 !== sha256(target)) problems.push(`${named}: sha256 differs from ${rel}; the file changed after it was declared`)
    if (!entry.source) problems.push(`${rel}: ${key} has no source`)
    else if (!ANONYMIZED.test(entry.source) && !entry.redacted)
      problems.push(`${rel}: ${key} comes from "${entry.source}", which is not «обезличенная база <name>», and carries no redacted note`)
  }
}

for (const [file, kind] of [...changed].sort()) {
  const parts = file.slice(EVIDENCE.length).split("/")
  if (parts.length < 2) {
    problems.push(`${file}: put it under ${EVIDENCE}<task>/ next to the ${MANIFEST} that declares it`)
    continue
  }
  const [task, ...rest] = parts
  const key = rest.join("/")
  const entry = manifests.get(task)?.get(key)
  if (!manifests.has(task)) problems.push(`${file}: ${kind}, and ${EVIDENCE}${task}/${MANIFEST} does not exist`)
  else if (!entry) problems.push(`${file}: ${kind}, and ${EVIDENCE}${task}/${MANIFEST} has no entry "${key}:"`)
  else if (kind === "added" && !ANONYMIZED.test(entry.source ?? ""))
    problems.push(`${file}: a new file must come from «обезличенная база <name>»; redacted is for a file already in git`)
}

if (problems.length) {
  console.error(
    [
      `check-evidence-manifest: ${problems.length} problem(s) against ${base}:`,
      ...problems.map((problem) => `  ${problem}`),
      "  rule and format: docs/evidence/README.md",
    ].join("\n"),
  )
  process.exit(1)
}
console.log(
  `check-evidence-manifest: OK — ${changed.size} changed media file(s) under ${EVIDENCE} declared, ` +
    `${entryCount} manifest entr${entryCount === 1 ? "y" : "ies"} match their files (base ${base})`,
)
