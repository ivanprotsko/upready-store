#!/usr/bin/env node
/**
 * No source file under `apps/` is longer than 800 lines (t-2026-10-14-55).
 * Ivan asked on 14.10.2026 for every file to stay under a fixed length, and 800
 * is the length past which an agent has to hold a whole file in its context
 * every time it touches it.
 *
 *   node scripts/check-file-length.mjs                # pnpm check:file-length
 *   node scripts/check-file-length.mjs --root <dir>   # another tree, such as an export of a base commit
 *
 * The check reads `.ts`, `.tsx`, `.js` and `.mjs` files. It skips `.d.ts`,
 * every `node_modules` and `migrations` directory, and build output. Inside a
 * git checkout the file list comes from `git ls-files`, tracked files and new
 * ones that are not ignored, so a new file counts before you commit it. Outside
 * one the script walks the tree.
 *
 * `scripts/file-length-allowlist.json` lists the files that are longer today,
 * each with its line count and a reason. A listed file fails when it grows past
 * its recorded count. An entry fails once its file is gone or back within the
 * limit, so you delete the entry in the change that shrinks the file and the
 * list only gets shorter.
 *
 * Exit 0 when every file passes, 1 when one fails, naming each.
 */
import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

const LIMIT = 800
const EXTENSIONS = [".ts", ".tsx", ".js", ".mjs"]
const SKIPPED_DIRS = new Set([
  "node_modules",
  "migrations",
  ".medusa",
  ".next",
  ".react-router",
  ".turbo",
  ".cache",
  "dist",
  "build",
  "out",
  "coverage",
  "test-results",
  "playwright-report",
  "blob-report",
])

const argv = process.argv.slice(2)
const rootFlag = argv.indexOf("--root")
const unknown = argv.filter((arg, i) => !(i === rootFlag || i === rootFlag + 1))
if (unknown.length || (rootFlag >= 0 && !argv[rootFlag + 1])) {
  console.error("usage: node scripts/check-file-length.mjs [--root <dir>]")
  process.exit(2)
}

const root =
  rootFlag >= 0
    ? path.resolve(argv[rootFlag + 1])
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const allowlistFile = path.join(root, "scripts/file-length-allowlist.json")

const isSource = (rel) => {
  const segments = rel.split("/")
  const name = segments[segments.length - 1]
  return (
    EXTENSIONS.some((ext) => name.endsWith(ext)) &&
    !name.endsWith(".d.ts") &&
    !segments.slice(0, -1).some((segment) => SKIPPED_DIRS.has(segment))
  )
}

const listFromGit = () => {
  try {
    const out = execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "apps"],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 },
    )
    return out.split("\0").filter(Boolean)
  } catch {
    return null
  }
}

const listFromDisk = () => {
  const found = []
  const walk = (rel) => {
    for (const entry of readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const child = `${rel}/${entry.name}`
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) walk(child)
      } else if (entry.isFile()) {
        found.push(child)
      }
    }
  }
  if (existsSync(path.join(root, "apps"))) walk("apps")
  return found
}

// `wc -l` counts newlines. A last line without one is still a line.
const countLines = (text) => {
  if (text.length === 0) return 0
  const newlines = text.split("\n").length - 1
  return text.endsWith("\n") ? newlines : newlines + 1
}

const readAllowlist = () => {
  if (!existsSync(allowlistFile)) return []
  const parsed = JSON.parse(readFileSync(allowlistFile, "utf8"))
  return Array.isArray(parsed.files) ? parsed.files : []
}

const problems = []
const allowlist = new Map()
for (const entry of readAllowlist()) {
  const where = `${path.relative(root, allowlistFile)}: entry ${JSON.stringify(entry.path)}`
  if (typeof entry.path !== "string" || !entry.path) {
    problems.push(`${where} has no path.`)
  } else if (allowlist.has(entry.path)) {
    problems.push(`${where} is listed twice.`)
  } else if (!Number.isInteger(entry.lines) || entry.lines <= LIMIT) {
    problems.push(`${where} needs "lines", the file's count today, above ${LIMIT}.`)
  } else if (typeof entry.reason !== "string" || !entry.reason.trim()) {
    problems.push(`${where} needs a "reason".`)
  } else {
    allowlist.set(entry.path, entry)
  }
}

const files = (listFromGit() ?? listFromDisk())
  .filter(isSource)
  .filter((rel) => existsSync(path.join(root, rel)))
  .sort()

const seen = new Set()
let over = 0
for (const rel of files) {
  const lines = countLines(readFileSync(path.join(root, rel), "utf8"))
  const entry = allowlist.get(rel)
  seen.add(rel)

  if (entry) {
    if (lines > entry.lines) {
      problems.push(
        `${rel}: ${lines} lines, past the ${entry.lines} its allowlist entry records. ` +
          `Move the new code into a file of its own, or split this one.`,
      )
    } else if (lines <= LIMIT) {
      problems.push(
        `${rel}: ${lines} lines, within the limit now. ` +
          `Delete its entry from scripts/file-length-allowlist.json.`,
      )
    } else {
      over += 1
    }
  } else if (lines > LIMIT) {
    problems.push(
      `${rel}: ${lines} lines, over the ${LIMIT}-line limit. ` +
        `Split it along its own seams, or list it in scripts/file-length-allowlist.json with a reason.`,
    )
  }
}

for (const rel of allowlist.keys()) {
  if (!seen.has(rel)) {
    problems.push(`${rel}: listed in scripts/file-length-allowlist.json, but no such source file. Delete the entry.`)
  }
}

if (problems.length) {
  for (const problem of problems) console.error(`check-file-length: ${problem}`)
  console.error(`check-file-length: FAIL, ${problems.length} problem(s) in ${files.length} files under apps/.`)
  process.exit(1)
}

console.log(
  `check-file-length: OK, ${files.length} files under apps/ checked, none over ${LIMIT} lines ` +
    `outside the allowlist (${over} listed).`,
)
