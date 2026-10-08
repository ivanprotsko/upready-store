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

test("every key the card asks for is in the catalog", () => {
  const card = read("../routes/settings/payments/components/tribute-card.tsx")
  const asked = [...card.matchAll(/t\("(tribute\.[\w.]+)"\)/g)].map((match) => match[1])
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
test("the card is hidden unless the backend says available, and is on the payments page", () => {
  const card = read("../routes/settings/payments/components/tribute-card.tsx")
  assert.match(card, /if \(tribute\?\.available !== true\) \{\s*return null\s*\}/)
  // The return comes before the card's markup, so nothing renders while the first answer is on its way.
  assert.ok(card.indexOf("tribute?.available !== true") < card.indexOf('data-testid="tribute-card"'))

  const page = read("../routes/settings/payments/payments.tsx")
  assert.match(page, /import \{ TributeCard \} from "\.\/components\/tribute-card"/)
  assert.match(page, /<TributeCard \/>/)
})

test("the key field is write only: a password input fed by the draft, never by the stored row", () => {
  const card = read("../routes/settings/payments/components/tribute-card.tsx")
  assert.match(card, /id="tribute_api_key"[\s\S]*?type="password"[\s\S]*?value=\{draft\.api_key\}/)
  assert.doesNotMatch(card, /settings\??\.api_key\??\.(?!set\b)\w+/)
  assert.match(card, /<SecretStatus masked=\{settings\?\.api_key\} \/>/)
  assert.match(card, /<Copy content=\{tribute\.callback_url\}/)

  const hook = read("../hooks/api/tribute.tsx")
  assert.match(hook, /"\/tenants\/tribute", \{ method: "PUT", body: payload \}/)
  assert.match(hook, /"\/tenants\/tribute", \{ method: "DELETE" \}/)
})
