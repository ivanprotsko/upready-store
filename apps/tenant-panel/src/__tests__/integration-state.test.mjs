import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { integrationTone } from "../lib/integration-state.ts"

/**
 * 46df D1: a stored credential the server cannot decrypt is its own state on
 * «Подключение» and on the service's page, never «подключено» and never «не
 * подключено». `integration-state.ts` is plain TS with no JSX, so it is
 * imported and run for real (see payment-methods-summary.test.mjs).
 */

test("an unreadable credential reads as unreadable, even next to a stored one", () => {
  assert.equal(integrationTone({ pending: false, stored: false, unreadable: true }), "unreadable")
  assert.equal(integrationTone({ pending: false, stored: true, unreadable: true }), "unreadable")
})

test("nothing is claimed while the query is in flight", () => {
  assert.equal(integrationTone({ pending: true, stored: false, unreadable: true }), "pending")
  assert.equal(integrationTone({ pending: true, stored: true, unreadable: false }), "pending")
})

test("a readable credential is connected, an absent one is missing", () => {
  assert.equal(integrationTone({ pending: false, stored: true, unreadable: false }), "connected")
  assert.equal(integrationTone({ pending: false, stored: false, unreadable: false }), "missing")
})

test("the owner's text exists in Russian and in English, and they differ", () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const read = (lang) =>
    JSON.parse(readFileSync(join(here, "..", "i18n", "translations", `${lang}.json`), "utf8"))
  const ru = read("ru").integrations
  const en = read("en").integrations

  for (const [name, pick] of [
    ["state.unreadable", (catalog) => catalog.state.unreadable],
    ["unreadable.alert", (catalog) => catalog.unreadable.alert],
    ["unreadable.rowNote", (catalog) => catalog.unreadable.rowNote],
  ]) {
    assert.equal(typeof pick(ru), "string", `ru ${name}`)
    assert.equal(typeof pick(en), "string", `en ${name}`)
    assert.ok(pick(ru).length > 0 && pick(en).length > 0, name)
    assert.notEqual(pick(ru), pick(en), `${name} is translated, not copied`)
  }
  assert.match(ru.state.unreadable, /введите заново/)
})
