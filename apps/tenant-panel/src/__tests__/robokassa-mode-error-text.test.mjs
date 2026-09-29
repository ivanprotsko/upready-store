import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { modeNeedsPasswordsKey } from "../routes/settings/payments/mode-needs-passwords-key.ts"

/**
 * 46df: the «не хватает паролей» toast on the Robokassa page used to say
 * «Введите их на странице Robokassa» to an owner already on it. That page
 * renders the password fields, so its text points at the form in front of
 * the owner; «Приём оплат», which has no password fields, keeps sending the
 * owner to the Robokassa page.
 */

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")
const catalogs = {
  ru: JSON.parse(read("../i18n/translations/ru.json")),
  en: JSON.parse(read("../i18n/translations/en.json")),
}
const lookup = (catalog, key) => key.split(".").reduce((node, part) => node?.[part], catalog)

test("the Robokassa page's refusal points at the form on this page, in every language", () => {
  for (const isTest of [true, false]) {
    const key = modeNeedsPasswordsKey(isTest, true)
    const ru = lookup(catalogs.ru, key)
    const en = lookup(catalogs.en, key)
    assert.match(ru, /на этой странице/)
    assert.doesNotMatch(ru, /на странице Robokassa/)
    assert.match(en, /on this page/)
    assert.doesNotMatch(en, /on the Robokassa page/)
    assert.match(ru, /\{\{fields\}\}/)
    assert.match(en, /\{\{fields\}\}/)
  }
})

test("«Приём оплат» (no password fields) still sends the owner to the Robokassa page", () => {
  for (const isTest of [true, false]) {
    const key = modeNeedsPasswordsKey(isTest, false)
    assert.match(lookup(catalogs.ru, key), /на странице Robokassa/)
    assert.match(lookup(catalogs.en, key), /on the Robokassa page/)
  }
})

test("the Robokassa page is the one screen that says its fields are on the page", () => {
  assert.match(
    read("../routes/settings/integrations/robokassa/robokassa.tsx"),
    /useRobokassaForm\(\{ credentialsOnPage: true \}\)/
  )
  assert.match(read("../routes/settings/payments/payments.tsx"), /useRobokassaForm\(\)/)
})
