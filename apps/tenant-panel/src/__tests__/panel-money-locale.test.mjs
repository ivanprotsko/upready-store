import { test } from "node:test"
import assert from "node:assert/strict"
import i18n from "i18next"

import { formatCurrency } from "../lib/format-currency.ts"

/**
 * U-07 (46df UX audit): money in the panel followed the BROWSER's language
 * (an en-US browser showed «₽1,644.01») while dates followed the panel's.
 * `format-currency.ts` has no JSX, so it is imported and run for real.
 */
const plain = (s) => s.replace(/[  ]/g, " ")

test("formatCurrency writes money in the panel language, whatever the browser's is", async () => {
  await i18n.init({ lng: "ru", resources: {} })
  assert.equal(plain(formatCurrency(1644.01, "RUB")), "1 644,01 ₽")
})

test("formatCurrency follows the panel when it switches language", async () => {
  await i18n.changeLanguage("en")
  assert.equal(plain(formatCurrency(1644.01, "RUB")), "RUB 1,644.01")
  await i18n.changeLanguage("ru")
})
