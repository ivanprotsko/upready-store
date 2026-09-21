#!/usr/bin/env node
/**
 * Adds new keys to every storefront UI catalog from a table of REAL translations.
 *
 * Unlike messages-fill-from-en.mjs, which copies the English string as a placeholder,
 * this refuses to write anything unless the table carries a text for every one of the
 * catalogs on disk, so a new key cannot reach a locale untranslated by accident.
 *
 * The table is a JSON file shaped as
 *   { "Namespace.key": { "en": "…", "ru": "…", …one entry per catalog… } }
 *
 * Usage: node apps/storefront/scripts/messages-add-translated.mjs <table.json> [--overwrite]
 *
 * A key already present is left untouched unless --overwrite is given. Key order inside a
 * namespace is preserved and new keys are appended, so the diff of a catalog is the new
 * lines only. Prints one line per catalog and exits 1 when the table is incomplete.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MESSAGES_DIR = path.join(__dirname, "..", "messages")

const [tableFile, ...flags] = process.argv.slice(2)
if (!tableFile) {
  console.error("usage: messages-add-translated.mjs <table.json> [--overwrite]")
  process.exit(2)
}
const overwrite = flags.includes("--overwrite")

const table = JSON.parse(readFileSync(path.resolve(tableFile), "utf8"))
const locales = readdirSync(MESSAGES_DIR)
  .filter((file) => file.endsWith(".json"))
  .map((file) => file.replace(/\.json$/, ""))
  .sort()

const problems = []
for (const [key, texts] of Object.entries(table)) {
  if (!/^[A-Za-z0-9]+\.[A-Za-z0-9_]+$/.test(key)) {
    problems.push(`${key}: expected "Namespace.key"`)
  }
  for (const locale of locales) {
    const text = texts[locale]
    if (typeof text !== "string" || !text.trim()) {
      problems.push(`${key}: no text for ${locale}`)
    } else if (locale !== "en" && text === texts.en && /[a-z]{4,}/i.test(text)) {
      problems.push(`${key}: ${locale} is the English string copied across`)
    }
  }
  for (const locale of Object.keys(texts)) {
    if (!locales.includes(locale)) problems.push(`${key}: ${locale} is not a catalog on disk`)
  }
}
if (problems.length) {
  console.error(problems.join("\n"))
  console.error(`\n${problems.length} problem(s); nothing was written`)
  process.exit(1)
}

let total = 0
for (const locale of locales) {
  const file = path.join(MESSAGES_DIR, `${locale}.json`)
  const catalog = JSON.parse(readFileSync(file, "utf8"))
  let added = 0
  for (const [key, texts] of Object.entries(table)) {
    const [namespace, name] = key.split(".")
    catalog[namespace] ??= {}
    if (catalog[namespace][name] !== undefined && !overwrite) continue
    if (catalog[namespace][name] === texts[locale]) continue
    catalog[namespace][name] = texts[locale]
    added += 1
  }
  if (added) writeFileSync(file, `${JSON.stringify(catalog, null, 2)}\n`)
  total += added
  console.log(`${locale}: ${added}`)
}
console.log(`written ${total} value(s) across ${locales.length} catalogs`)
