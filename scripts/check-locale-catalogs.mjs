#!/usr/bin/env node
/**
 * Fails when the three hand-transcribed locale-code catalogs drift apart:
 *
 *   apps/storefront/src/i18n/config.ts                      `locales`
 *   apps/backend/src/api/tenants/locale-settings/validators.ts  `LOCALE_CODES`
 *   apps/tenant-panel/src/lib/locale-catalog.ts               `LOCALE_CODES`
 *
 * `pnpm-workspace.yaml` lists only `apps/**`, so there is no shared package
 * any of the three could import the storefront's own list from (each file
 * says so in its own header comment) — a real `@upready/*` package is the
 * right long-term shape, but it drags in build wiring across three apps that
 * a shop-owner clone must keep working. This is the cheaper guard the task
 * asked for instead: a test that goes red the moment one file lists a locale
 * the other two do not.
 *
 *   node scripts/check-locale-catalogs.mjs
 *
 * Exit 0 and a one-line summary when all three agree; exit 1 and the exact
 * per-file difference otherwise.
 */
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, "..")

const SOURCES = [
  {
    label: "storefront (apps/storefront/src/i18n/config.ts)",
    path: join(repo, "apps/storefront/src/i18n/config.ts"),
    arrayName: "locales",
  },
  {
    label: "backend (apps/backend/src/api/tenants/locale-settings/validators.ts)",
    path: join(repo, "apps/backend/src/api/tenants/locale-settings/validators.ts"),
    arrayName: "LOCALE_CODES",
  },
  {
    label: "tenant-panel (apps/tenant-panel/src/lib/locale-catalog.ts)",
    path: join(repo, "apps/tenant-panel/src/lib/locale-catalog.ts"),
    arrayName: "LOCALE_CODES",
  },
]

/** Pulls the quoted locale codes out of `export const <arrayName> = [ ... ] as const`. */
function readCodes({ path, arrayName }) {
  const text = readFileSync(path, "utf8")
  const marker = `export const ${arrayName} = [`
  const start = text.indexOf(marker)
  if (start === -1) {
    throw new Error(`${path}: no "${marker}" — the catalog moved or was renamed.`)
  }
  const end = text.indexOf("]", start)
  if (end === -1) {
    throw new Error(`${path}: "${marker}" has no closing "]".`)
  }
  const body = text.slice(start + marker.length, end)
  return [...body.matchAll(/"([a-z]{2,3})"/g)].map((m) => m[1])
}

function checkLocaleCatalogs() {
  const catalogs = SOURCES.map((source) => ({ ...source, codes: readCodes(source) }))
  const reference = catalogs[0]
  const refSet = new Set(reference.codes)

  const problems = []
  for (const catalog of catalogs.slice(1)) {
    const set = new Set(catalog.codes)
    const missing = reference.codes.filter((code) => !set.has(code))
    const extra = catalog.codes.filter((code) => !refSet.has(code))
    const dup = catalog.codes.filter((code, i) => catalog.codes.indexOf(code) !== i)
    if (missing.length || extra.length || dup.length) {
      problems.push({ label: catalog.label, missing, extra, dup })
    }
  }
  const refDup = reference.codes.filter((code, i) => reference.codes.indexOf(code) !== i)
  if (refDup.length) {
    problems.push({ label: reference.label, missing: [], extra: [], dup: refDup })
  }

  return { catalogs, reference, problems }
}

function main() {
  const { catalogs, reference, problems } = checkLocaleCatalogs()

  if (problems.length) {
    console.error(
      `check-locale-catalogs: DRIFT against ${reference.label} (${reference.codes.length} codes):`,
    )
    for (const problem of problems) {
      console.error(`  ${problem.label}:`)
      if (problem.missing.length) console.error(`    missing: ${problem.missing.join(", ")}`)
      if (problem.extra.length) console.error(`    extra:   ${problem.extra.join(", ")}`)
      if (problem.dup.length) console.error(`    duplicate: ${problem.dup.join(", ")}`)
    }
    process.exitCode = 1
    return
  }

  console.log(
    `check-locale-catalogs: OK — ${catalogs.length} catalogs, ${reference.codes.length} codes each, all agree.`,
  )
}

main()
