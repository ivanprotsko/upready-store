import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * t-2026-10-14-01 (release stand 14.10, Ivan: «гость и пользователь»): the
 * customers list read «Зарегистрирован» over a badge «Зарегистрирован». The
 * column is «Аккаунт» now, its badges «Гость» (grey) and «Пользователь»
 * (green), and the customer page's header says the same two words in the same
 * colours. This package cannot render JSX, so the contract is asserted on the
 * source.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const read = (path) => readFileSync(join(SRC, path), "utf8")

const columns = read("hooks/table/columns/use-customer-table-columns.tsx")
const detail = read("routes/customers/customer-detail/customer-detail.tsx")
const ru = JSON.parse(read("i18n/translations/ru.json"))
const en = JSON.parse(read("i18n/translations/en.json"))

/** The JSX from the `has_account` check to the end of its `else` badge. */
const badgeOf = (source) => {
  const start = source.indexOf("has_account")
  assert.ok(start !== -1, "the source reads has_account")
  const guest = 't("customers.guest")'
  const end = source.indexOf(guest, start)
  assert.ok(end !== -1, "the guest badge follows the account check")
  return source.slice(start, end + guest.length + 1)
}

test("the words: «Аккаунт» over «Гость» / «Пользователь», in ru and en", () => {
  assert.equal(ru.customers.fields.account, "Аккаунт")
  assert.equal(ru.customers.guest, "Гость")
  assert.equal(ru.customers.registered, "Пользователь")
  assert.equal(en.customers.fields.account, "Account")
  assert.equal(en.customers.guest, "Guest")
  assert.equal(en.customers.registered, "Registered user")
})

test("no «Зарегистрирован» left under customers, and the old column key is gone", () => {
  const words = JSON.stringify(ru.customers)
  assert.ok(!words.includes("Зарегистрирован"), "ru.customers must not say «Зарегистрирован»")
  assert.equal(ru.customers.fields.registered, undefined)
  assert.equal(en.customers.fields.registered, undefined)
  assert.ok(!columns.includes("customers.fields.registered"))
})

test("the list's column is «Аккаунт» with a green «Пользователь» and a grey «Гость»", () => {
  assert.ok(columns.includes('header: () => t("customers.fields.account")'))
  const badge = badgeOf(columns)
  assert.match(badge, /color="green">\s*\{t\("customers\.registered"\)\}/)
  assert.match(badge, /color="grey">\s*\{t\("customers\.guest"\)\}/)
})

test("the customer page's header shows the same badge in the same colours", () => {
  const badge = badgeOf(detail)
  assert.match(badge, /color="green">\s*\{t\("customers\.registered"\)\}/)
  assert.match(badge, /color="grey">\s*\{t\("customers\.guest"\)\}/)
})
