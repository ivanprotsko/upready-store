#!/usr/bin/env node
/**
 * Fails when an owner screen shows engineering internals. It reads what the
 * walker saved (`owner-walker.e2e.mjs` writes the `innerText` of every screen
 * next to its screenshot), so it costs no browser and no server of its own:
 *
 *   SHOT_DIR=artifacts/docs/t-2026-09-21-02/after \
 *     node apps/tenant-panel/e2e/owner-internals-probe.mjs
 *
 * `innerText` holds only what is rendered, so a closed «Подробности для
 * поддержки» block stays out of it: that is where the raw text belongs.
 *
 * `ONLY=<regexp>` limits the probe to matching file names, `WIDTHS=1440,390`
 * picks the width folders. Exit code 1 means at least one match; every match is
 * printed as `<width>/<screen>: <rule>: <the line>`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

const SHOT_DIR = resolve(process.env.SHOT_DIR || "artifacts/docs/t-2026-09-21-02/walk")
const WIDTHS = (process.env.WIDTHS || "1440,390").split(",").map((w) => w.trim()).filter(Boolean)
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null

/** One rule per kind of internals the owner must never read. */
const RULES = [
  ["http-verb-with-path", /\b(GET|POST|PUT|PATCH|DELETE)\s+\/?[\w.-]*\/[\w/{}:.-]+/],
  ["http-verb-cell", /^(GET|POST|PUT|PATCH|DELETE)$/],
  ["marketplace-api-host", /[\w-]+-api\.wildberries\.ru|api-seller\.ozon\.ru/],
  ["env-var-name", /\b[A-Z][A-Z0-9]{1,}(?:_[A-Z0-9]+){1,}\b/],
  ["cli-command", /\b(?:wb|ozon|mp):[a-z][\w:-]*|\b(?:pnpm|npm|npx|medusa)\s+[a-z]/],
  ["raw-json", /\{\s*"[\w-]+"\s*:/],
  ["template-placeholder", /\{\{\s*[\w.]+\s*\}\}/],
  ["entity-id", /\b(?:ten|order|pcat|prod|variant|cus|reg|sloc|ful|pay|sc)_[0-9A-Za-z]{10,}\b/],
  ["raw-translation-key", /\b[a-z][A-Za-z]+(?:\.[a-z][A-Za-z0-9]+){2,}\b/],
  ["engineering-word", /\bCNAME\b|\bSHA-?256\b|\bJSON\b|\bSKU\b|\bwebhook\b|стенд|скрипт|бэкенд|Метаданные/i],
]

/** Things that look like internals and are not: a site address, an e-mail. */
const ALLOW = [
  /^https?:\/\/\S+$/,
  /^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i,
]

/** A site address reads like a dotted key: take addresses out before the rules run. */
const withoutAddresses = (line) =>
  line
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\b[\w-]+(?:\.[\w-]+)*\.(?:ru|dev|com|net|org|io|shop|store|test|su)\b/g, " ")

/** A line may carry a secret (a token in an address): never echo long opaque runs. */
const mask = (line) => line.replace(/[0-9A-Za-z_-]{20,}/g, "…").slice(0, 160)

let screens = 0
let hits = 0

for (const width of WIDTHS) {
  const dir = join(SHOT_DIR, width)
  if (!existsSync(dir)) {
    console.error(`no folder ${dir}: run the walker first`)
    process.exit(2)
  }
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".txt")).sort()) {
    if (ONLY && !ONLY.test(file)) {
      continue
    }
    screens += 1
    const lines = readFileSync(join(dir, file), "utf8").split("\n")
    for (const raw of lines) {
      const line = raw.trim()
      if (!line || ALLOW.some((a) => a.test(line))) {
        continue
      }
      const text = withoutAddresses(line)
      for (const [rule, pattern] of RULES) {
        // The marketplace host rule is about addresses, so it reads the line as it is.
        if (pattern.test(rule === "marketplace-api-host" ? line : text)) {
          hits += 1
          console.log(`${width}/${file.replace(/\.txt$/, "")}: ${rule}: ${mask(line)}`)
        }
      }
    }
  }
}

console.log(`\nscreens read: ${screens}, internals found: ${hits}`)
process.exit(hits ? 1 : 0)
