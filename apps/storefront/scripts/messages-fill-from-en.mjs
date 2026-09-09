#!/usr/bin/env node
/**
 * Fills every storefront UI catalog with any key present in en.json but missing
 * from that catalog, copying the English value verbatim (a placeholder to be
 * translated later, not a claim that it already reads naturally in that locale).
 *
 * Idempotent: a key already present in a catalog, at any depth, is left
 * untouched. Prints one line per catalog with how many keys it added, and a
 * final total, so a re-run against an already-filled tree reports zeros.
 *
 * Usage: node apps/storefront/scripts/messages-fill-from-en.mjs
 * (run from the repository root or from apps/storefront; the path below is
 * resolved relative to this script's own location, not the cwd).
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MESSAGES_DIR = path.join(__dirname, "..", "messages")

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Copies every leaf missing from `target` (compared against `source`) into `target`, in place. Returns the count of leaves added. */
function fillMissing(source, target) {
  let added = 0
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value)) {
      if (!isPlainObject(target[key])) {
        target[key] = {}
      }
      added += fillMissing(value, target[key])
    } else if (!(key in target)) {
      target[key] = value
      added += 1
    }
  }
  return added
}

function sortDeep(value) {
  if (!isPlainObject(value)) return value
  const sorted = {}
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortDeep(value[key])
  }
  return sorted
}

const en = JSON.parse(readFileSync(path.join(MESSAGES_DIR, "en.json"), "utf8"))
const files = readdirSync(MESSAGES_DIR).filter((f) => f.endsWith(".json") && f !== "en.json")

let total = 0
for (const file of files) {
  const filePath = path.join(MESSAGES_DIR, file)
  const catalog = JSON.parse(readFileSync(filePath, "utf8"))
  const added = fillMissing(en, catalog)
  if (added > 0) {
    writeFileSync(filePath, JSON.stringify(sortDeep(catalog), null, 2) + "\n")
  }
  total += added
  console.log(`${file}: ${added} key(s) added`)
}
console.log(`done: ${total} key(s) added across ${files.length} catalog(s)`)
