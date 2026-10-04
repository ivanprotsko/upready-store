import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * «Wildberries → Обновление» names every kind of data and every state of a run
 * in the owner's words (task-07 of ask-20261005-023327-f02b).
 *
 * The kinds and states are the BACKEND's lists, read here from the backend's
 * own source rather than copied: a kind registered there without a name in
 * `marketplaces.kinds.*` would otherwise reach the screen as «другие данные»
 * and nobody would notice. This test is where it turns up instead.
 *
 * The second half holds every literal key the screen and its warnings ask for
 * against both catalogs, so a renamed key fails here and not as a raw key on
 * the owner's screen.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const BACKEND = join(SRC, "../../backend/src")
const read = (path) => readFileSync(path, "utf8")

/** The string items of `export const NAME = [ ... ]` in a backend source file. */
const listOf = (file, name) => {
  const source = read(join(BACKEND, file))
  const start = source.indexOf(`export const ${name} = [`)
  assert.notEqual(start, -1, `${name} not found in ${file}`)
  const body = source.slice(start, source.indexOf("]", start))
  return [...body.matchAll(/"([a-z_]+)"/g)].map((match) => match[1])
}

const kinds = [
  ...listOf("modules/wb/models/wb-sync-run.ts", "WB_SYNC_KINDS"),
  ...listOf("modules/ozon/models/ozon-sync-run.ts", "OZON_SYNC_KINDS"),
  "projection",
]
const schedule = read(join(BACKEND, "modules/marketplace/schedule.ts"))
const authFailed = schedule.match(/export const MP_AUTH_FAILED = "([a-z_]+)"/)?.[1]
const statuses = [
  ...listOf("modules/wb/models/wb-sync-run.ts", "WB_SYNC_STATUSES"),
  ...listOf("modules/ozon/models/ozon-sync-run.ts", "OZON_SYNC_STATUSES"),
  authFailed,
]

const catalogs = {
  ru: JSON.parse(read(join(SRC, "i18n/translations/ru.json"))),
  en: JSON.parse(read(join(SRC, "i18n/translations/en.json"))),
}

const lookup = (catalog, key) =>
  key.split(".").reduce((node, part) => (node && typeof node === "object" ? node[part] : undefined), catalog)

test("the backend lists were found", () => {
  assert.ok(kinds.length >= 11, `expected the WB and Ozon kinds, got ${kinds.join(", ")}`)
  assert.ok(authFailed, "MP_AUTH_FAILED not found in schedule.ts")
})

for (const [lang, catalog] of Object.entries(catalogs)) {
  test(`every kind the backend schedules has a name in ${lang}`, () => {
    const missing = [...new Set(kinds)].filter((kind) => typeof lookup(catalog, `marketplaces.kinds.${kind}`) !== "string")
    assert.deepEqual(missing, [], `marketplaces.kinds.* is missing in ${lang}.json`)
  })

  test(`every state of a run has a name in ${lang}`, () => {
    const missing = [...new Set(statuses)].filter(
      (status) => typeof lookup(catalog, `marketplaces.statuses.${status}`) !== "string"
    )
    assert.deepEqual(missing, [], `marketplaces.statuses.* is missing in ${lang}.json`)
  })
}

const screenFiles = [
  "routes/marketplaces/mp-sync/mp-sync.tsx",
  "routes/marketplaces/mp-sync/components/mp-sync-warnings.tsx",
  "routes/marketplaces/mp-sync/components/kind-label.ts",
]

const literalKeys = [
  ...new Set(
    screenFiles.flatMap((file) =>
      [...read(join(SRC, file)).matchAll(/\bt\(\s*"((?:mp|marketplaceSync|marketplaces)\.[A-Za-z0-9_.]+)"/g)].map(
        (match) => match[1]
      )
    )
  ),
]

test("the screen asks for its keys by name", () => {
  assert.ok(literalKeys.length > 20, `found only ${literalKeys.length} literal keys`)
})

for (const [lang, catalog] of Object.entries(catalogs)) {
  test(`every key the screen asks for exists in ${lang}`, () => {
    const missing = literalKeys.filter((key) => typeof lookup(catalog, key) !== "string")
    assert.deepEqual(missing, [], `missing in ${lang}.json`)
  })

  test(`every reason a skipped kind can carry has words in ${lang}`, () => {
    const reasons = ["no_key", "integration_disabled", "locked", "waiting"]
    const missing = reasons.filter(
      (reason) => typeof lookup(catalog, `marketplaceSync.syncNow.reasons.${reason}`) !== "string"
    )
    assert.deepEqual(missing, [])
  })
}
