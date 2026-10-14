import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  modeNeedsPasswordsKey,
  robokassaSaveErrorText,
} from "../routes/settings/payments/mode-needs-passwords-key.ts"

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
  // t-2026-10-14-01 (G3): «Приём оплат» became a list; the behaviour drawer
  // of the Robokassa card has no password fields either.
  const drawer = read("../routes/settings/payments/components/robokassa-edit.tsx")
  assert.match(drawer, /modeNeedsPasswordsText\(t, values\.is_test, missing, false\)/)
  assert.match(drawer, /robokassaSaveErrorText\(t, \(saveError as Error\)\.message, false\)/)
})

// A stand-in `t` that names the key and its options, so the parse runs for real.
const t = (key, options) => (options ? `${key}|${options.fields ?? ""}` : key)

test("the API's English refusal is said in the panel's language, with the missing fields named", () => {
  assert.equal(
    robokassaSaveErrorText(t, "Test mode needs test_password1 and test_password2 before it can be enabled.", false),
    "paymentSettings.modeNeedsPasswords.test|paymentSettings.fields.test_password1, paymentSettings.fields.test_password2"
  )
  assert.equal(
    robokassaSaveErrorText(t, "Live mode needs password2 before it can be enabled.", true),
    "paymentSettings.modeNeedsPasswords.liveHere|paymentSettings.fields.password2"
  )
  // Anything else is the platform's own message, passed through as is.
  assert.equal(robokassaSaveErrorText(t, "merchant_login is required", false), "merchant_login is required")
})
