import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { tributeDraftErrors, tributeDraftFrom, tributePayload } from "../lib/tribute-settings.ts"

/**
 * «Tribute» on «Приём оплат» (t-cherk-22, part A). `tribute-settings.ts` is
 * plain TS with no JSX, so it is imported and run for real, as
 * `btcpay-settings.test.mjs` does. What it pins down: the key field is write
 * only (it always starts empty, and an empty one is never sent), the switch
 * cannot go on without a key, and the card exists only where the backend says
 * the instance offers Tribute.
 */

const SAVED_KEY_LAST4 = "9c21"

const stored = {
  id: "tis_1",
  provider: "tribute",
  is_enabled: false,
  shop_id: null,
  api_key: { set: true, last4: SAVED_KEY_LAST4 },
}

test("the form starts from the stored row, with the key field empty", () => {
  assert.deepEqual(tributeDraftFrom(stored), { enabled: false, api_key: "" })
  assert.deepEqual(tributeDraftFrom({ ...stored, is_enabled: true }), { enabled: true, api_key: "" })
  // A shop that never saved a key starts on, the backend's own default for a new row.
  assert.deepEqual(tributeDraftFrom(null), { enabled: true, api_key: "" })
})

test("an empty key is left out of the PUT, so the stored one stays", () => {
  assert.deepEqual(tributePayload({ enabled: true, api_key: "   " }), { is_enabled: true })
  assert.deepEqual(tributePayload({ enabled: false, api_key: "  trbt_new  " }), {
    is_enabled: false,
    api_key: "trbt_new",
  })
})

test("switching on needs a key, a stored one counting as present", () => {
  assert.deepEqual(tributeDraftErrors({ enabled: true, api_key: "" }, null), { api_key: "tribute.errors.required" })
  assert.deepEqual(tributeDraftErrors({ enabled: true, api_key: "  " }, { ...stored, api_key: { set: false, last4: null } }), {
    api_key: "tribute.errors.required",
  })
  assert.deepEqual(tributeDraftErrors({ enabled: true, api_key: "" }, stored), {})
  assert.deepEqual(tributeDraftErrors({ enabled: true, api_key: "trbt_new" }, null), {})
  assert.deepEqual(tributeDraftErrors({ enabled: false, api_key: "" }, null), {})
})

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")
const catalogs = {
  ru: JSON.parse(read("../i18n/translations/ru.json")),
  en: JSON.parse(read("../i18n/translations/en.json")),
}
const keysOf = (node, prefix = "") =>
  Object.entries(node).flatMap(([key, value]) =>
    value && typeof value === "object" ? keysOf(value, `${prefix}${key}.`) : [`${prefix}${key}`]
  )
const valueAt = (node, path) => path.split(".").reduce((value, key) => value?.[key], node)

test("every Tribute string exists in both panel languages, translated", () => {
  const en = keysOf(catalogs.en.tribute).sort()
  const ru = keysOf(catalogs.ru.tribute).sort()
  assert.deepEqual(ru, en)
  assert.ok(en.length > 15)
  // Only the brand name may read the same in both languages.
  const same = en.filter((key) => valueAt(catalogs.ru.tribute, key) === valueAt(catalogs.en.tribute, key))
  assert.deepEqual(same, ["title"])
})

// t-2026-10-14-01 (panel redesign, G3): the card reads and the drawer edits.
const card = read("../routes/settings/payments/components/tribute-card.tsx")
const edit = read("../routes/settings/payments/components/tribute-edit.tsx")

test("every key the card and its drawer ask for is in the catalog", () => {
  const asked = [...`${card}\n${edit}`.matchAll(/t\("((?:tribute|paymentMethods)\.[\w.]+)"/g)].map((match) => match[1])
  assert.ok(asked.length > 10)
  for (const key of asked) {
    assert.equal(typeof valueAt(catalogs.en, key), "string", `en is missing ${key}`)
    assert.equal(typeof valueAt(catalogs.ru, key), "string", `ru is missing ${key}`)
  }
})

/**
 * This package has no JSX test runtime, so the wiring is checked in the
 * source, the way `btcpay-settings.test.mjs` checks the BTCPay card.
 */
test("the card leads back to the list unless the backend says available, and the list hides its row", () => {
  assert.match(
    card,
    /if \(tribute && tribute\.available !== true\) \{\s*return <Navigate to="\/settings\/payments" replace \/>\s*\}/
  )
  // The redirect comes before the card's markup, so nothing renders on an instance without Tribute.
  assert.ok(card.indexOf("tribute.available !== true") < card.indexOf("<SettingsDetail"))

  const page = read("../routes/settings/payments/payments.tsx")
  assert.match(page, /tributeAvailable: tribute\?\.available === true/)
})

test("the key field is write only: a password input that starts empty, never fed by the stored row", () => {
  assert.match(edit, /name="api_key"[\s\S]*?type="password"/)
  assert.match(edit, /defaultValues=\{tributeDraftFrom\(settings\)\}/)
  assert.match(edit, /mutateAsync\(tributePayload\(draft\)\)/)
  for (const source of [card, edit]) {
    assert.doesNotMatch(source, /api_key\??\.(?!set\b|last4\b)\w+/)
  }
  // The card reads the key as its last four signs (design-system rule 13).
  assert.match(card, /t\("paymentMethods\.masked", \{ last4: settings\.api_key\.last4 \?\? "" \}\)/)
  assert.match(card, /<AddressValue value=\{tribute\.callback_url\}/)

  const hook = read("../hooks/api/tribute.tsx")
  assert.match(hook, /"\/tenants\/tribute", \{ method: "PUT", body: payload \}/)
  assert.match(hook, /"\/tenants\/tribute", \{ method: "DELETE" \}/)
})

test("«Удалить ключ» is the last group of the first «…», after «Изменить», and asks first (rule 8)", () => {
  assert.ok(card.indexOf('to: "edit"') < card.indexOf("onClick: handleRemove"))
  assert.match(card, /const confirmed = await prompt\(\{\s*title: t\("tribute\.removeTitle"\)/)
  assert.ok(card.indexOf("if (!confirmed)") < card.indexOf("await remove()"))
  assert.doesNotMatch(card, /variant="danger"/)
})
