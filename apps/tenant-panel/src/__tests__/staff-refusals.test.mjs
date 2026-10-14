import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { STAFF_REFUSAL_CODES, staffRefusalKey } from "../lib/staff-refusals.ts"
import { staffErrorText } from "../lib/staff.ts"

/**
 * The refusals of the staff routes in the owner's language (t-2026-10-07-11,
 * addendum 13). The server says them in English, and the request library keeps
 * only that text, so the panel finds a refusal by its text and shows its own
 * translation. The texts are the backend's: this test reads its file and fails
 * when a text has no row in the panel, or a code has no translation.
 */

const here = dirname(fileURLToPath(import.meta.url))
const read = (path) => readFileSync(join(here, "..", path), "utf8")

const BACKEND_FILE = join(here, "../../../backend/src/api/tenants/staff/staff-refusals.ts")

/**
 * COPY, to be deleted once part A is in this branch: the seven texts as the
 * staff routes of the branch `feat/tenant-staff-roles-api` say them on
 * 2026-10-08 (`staff/route.ts`, `staff/[id]/route.ts`, `staff/staff-rules.ts`).
 * When the backend's own file exists the test reads it and also checks that
 * this copy has not drifted from it.
 */
const COPY_OF_STAFF_REFUSALS = {
  email_taken_in_shop: "A login with this email already exists in this shop.",
  email_has_account:
    "This email already has an account on the platform, so a login with a new password cannot be created for it here. " +
    "Use another email, or ask platform support to attach the existing account to this shop.",
  own_role: "You cannot change your own role. Another owner of the shop can do it.",
  own_login: "You cannot remove your own login. Another owner of the shop can do it.",
  last_owner_remove:
    "This is the last owner of the shop; it cannot be removed. Make another login an owner first.",
  last_owner_demote:
    "This is the last owner of the shop; its role cannot be changed. Make another login an owner first.",
  password_shared:
    "This login is also used outside this shop, so its password cannot be changed here. " +
    "The person can change it in their own profile or through the reset link on the login page.",
  developer_row:
    "This is the platform developer's login. Only the platform changes or removes it, not the shop.",
}

const backendHasFile = existsSync(BACKEND_FILE)
const STAFF_REFUSALS = backendHasFile
  ? (await import(pathToFileURL(BACKEND_FILE).href)).STAFF_REFUSALS
  : COPY_OF_STAFF_REFUSALS

const catalogs = {
  ru: JSON.parse(read("i18n/translations/ru.json")),
  en: JSON.parse(read("i18n/translations/en.json")),
}
const lookup = (catalog, key) =>
  key.split(".").reduce((node, part) => (node && typeof node === "object" ? node[part] : undefined), catalog)

test("the eight refusals of the contract", () => {
  assert.deepEqual(Object.keys(STAFF_REFUSALS).sort(), [
    "developer_row",
    "email_has_account",
    "email_taken_in_shop",
    "last_owner_demote",
    "last_owner_remove",
    "own_login",
    "own_role",
    "password_shared",
  ])
})

test("the copy kept in this test says what the backend's file says", { skip: !backendHasFile }, () => {
  assert.deepEqual(COPY_OF_STAFF_REFUSALS, { ...STAFF_REFUSALS })
})

test("every refusal text of the backend has a row in the panel, under the backend's code", () => {
  for (const [code, text] of Object.entries(STAFF_REFUSALS)) {
    assert.equal(STAFF_REFUSAL_CODES[text], code, `no row for «${text}»`)
    assert.equal(staffRefusalKey(text), `staff.refusals.${code}`)
  }
  assert.deepEqual(
    Object.values(STAFF_REFUSAL_CODES).sort(),
    Object.keys(STAFF_REFUSALS).sort(),
    "the panel's table has a row the backend does not send"
  )
})

test("every code has a translation in both catalogs, and the catalogs hold no other", () => {
  for (const [language, catalog] of Object.entries(catalogs)) {
    assert.deepEqual(
      Object.keys(catalog.staff.refusals).sort(),
      Object.keys(STAFF_REFUSALS).sort(),
      `${language}.json: the refusals differ from the backend's codes`
    )
    for (const code of Object.keys(STAFF_REFUSALS)) {
      const text = lookup(catalog, `staff.refusals.${code}`)
      assert.ok(typeof text === "string" && text.length > 20, `${language}.json lacks staff.refusals.${code}`)
    }
  }
})

test("a Russian refusal says what happened and what to do next, and is not the English text", () => {
  for (const [code, english] of Object.entries(STAFF_REFUSALS)) {
    const russian = catalogs.ru.staff.refusals[code]
    assert.match(russian, /[а-яё]/i, code)
    assert.notEqual(russian, english, code)
    assert.match(russian, /\. [А-ЯЁ]/, `${code}: one sentence, no next step`)
    assert.ok(russian.length <= 200, `${code}: ${russian.length} characters is not short`)
  }
})

test("the owner reads a known refusal in the panel's language", () => {
  const translate = (key) => lookup(catalogs.ru, key)
  for (const [code, text] of Object.entries(STAFF_REFUSALS)) {
    const error = Object.assign(new Error(text), { status: 400 })
    assert.equal(staffErrorText(error, "general", translate), catalogs.ru.staff.refusals[code])
  }
  // The same words with other spacing are still the same refusal.
  const spaced = `  ${STAFF_REFUSALS.own_role.replace(". ", ".\n  ")} `
  assert.equal(staffErrorText({ message: spaced }, "general", translate), catalogs.ru.staff.refusals.own_role)
})

test("a refusal the table does not know is shown in the server's own words", () => {
  const translate = (key) => lookup(catalogs.ru, key)
  const unknown = "The password must contain a digit."
  assert.equal(staffRefusalKey(unknown), null)
  assert.equal(staffErrorText({ message: unknown }, "general", translate), unknown)
  assert.equal(staffErrorText({ message: "" }, "general", translate), "general")
  assert.equal(staffErrorText(undefined, "general", translate), "general")
})

test("both places that show a staff refusal pass the translation in", () => {
  // t-2026-10-14-01 (G2): the form is a route drawer that shows a refusal as
  // `toast.error`, and «Удалить» lives in one hook for the list and the card.
  const drawer = read("routes/settings/staff/staff-drawer.tsx")
  assert.match(drawer, /throw new Error\(staffErrorText\(submitError, t\("staff\.errors\.general"\), \(key\) => t\(key\)\)\)/)
  const remove = read("routes/settings/staff/use-staff-delete.ts")
  assert.match(remove, /toast\.error\(staffErrorText\(deleteError, t\("staff\.errors\.general"\), \(key\) => t\(key\)\)\)/)
})
