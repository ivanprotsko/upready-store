import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  btcpayDraftErrors,
  btcpayDraftFrom,
  btcpayPayload,
  isValidBtcpayServerUrl,
} from "../lib/btcpay-settings.ts"

/**
 * «Криптовалюта (BTCPay Server)» on «Приём оплат» (ask-20261005-070255-438f).
 * `btcpay-settings.ts` is plain TS with no JSX, so it is imported and run for
 * real, as `payment-methods-summary.test.mjs` does. What it pins down: a secret
 * the owner leaves empty is never sent (the stored one stays), the switch
 * cannot go on with a value missing, and the address rules match the backend's.
 */

const stored = {
  id: "tis_1",
  provider: "btcpay",
  is_enabled: false,
  server_url: "https://pay.example.com",
  store_id: "Store1",
  api_key: { set: true, last4: "1234" },
  webhook_secret: { set: true, last4: "5678" },
}

test("the form starts from the stored store, with both secrets empty", () => {
  assert.deepEqual(btcpayDraftFrom(stored), {
    enabled: false,
    server_url: "https://pay.example.com",
    store_id: "Store1",
    api_key: "",
    webhook_secret: "",
  })
  assert.equal(btcpayDraftFrom(null).server_url, "")
})

test("an empty secret is left out of the PUT, so the stored one stays", () => {
  const body = btcpayPayload({ ...btcpayDraftFrom(stored), enabled: true, api_key: "  new-key  " })
  assert.deepEqual(body, {
    is_enabled: true,
    server_url: "https://pay.example.com",
    store_id: "Store1",
    api_key: "new-key",
  })
  assert.equal("webhook_secret" in body, false)
})

test("switching on needs all four values, a stored secret counting as present", () => {
  assert.deepEqual(btcpayDraftErrors({ ...btcpayDraftFrom(stored), enabled: true }, stored), {})

  const fresh = { enabled: true, server_url: "https://pay.example.com", store_id: "", api_key: "k", webhook_secret: "" }
  assert.deepEqual(btcpayDraftErrors(fresh, null), {
    store_id: "btcpay.errors.required",
    webhook_secret: "btcpay.errors.required",
  })
})

test("a switched-off store may be saved incomplete", () => {
  assert.deepEqual(
    btcpayDraftErrors({ enabled: false, server_url: "", store_id: "", api_key: "", webhook_secret: "" }, null),
    {}
  )
})

test("the server address follows the backend's rules", () => {
  assert.equal(isValidBtcpayServerUrl("https://pay.example.com"), true)
  assert.equal(isValidBtcpayServerUrl("https://pay.example.com/btcpay/"), true)
  assert.equal(isValidBtcpayServerUrl("http://localhost:23001"), true)
  assert.equal(isValidBtcpayServerUrl("http://pay.example.com"), false)
  assert.equal(isValidBtcpayServerUrl("https://pay.example.com/?x=1"), false)
  assert.equal(isValidBtcpayServerUrl("https://user:pw@pay.example.com"), false)
  assert.equal(isValidBtcpayServerUrl("pay.example.com"), false)

  const errors = btcpayDraftErrors(
    { enabled: false, server_url: "http://pay.example.com", store_id: "a/b", api_key: "", webhook_secret: "" },
    null
  )
  assert.deepEqual(errors, { server_url: "btcpay.errors.serverUrl", store_id: "btcpay.errors.storeId" })
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

test("every BTCPay string exists in both panel languages, translated", () => {
  const en = keysOf(catalogs.en.btcpay).sort()
  const ru = keysOf(catalogs.ru.btcpay).sort()
  assert.deepEqual(ru, en)
  assert.ok(en.length > 10)
  assert.notEqual(catalogs.ru.btcpay.title, catalogs.en.btcpay.title)
  assert.ok(catalogs.en.paymentSettings.methodsSummary.btcpay)
  assert.ok(catalogs.ru.paymentSettings.methodsSummary.btcpay)
})

/**
 * PR #272 review: on an instance that takes no cryptocurrency the backend
 * answers `available: false`, and the panel shows BTCPay nowhere. This package
 * has no JSX test runtime, so the wiring is checked in the source, the way
 * `telegram-bot-webhook.test.mjs` checks its page.
 */
test("the card, the summary and the pre-payment notice all hide BTCPay unless the backend says available", () => {
  const card = read("../routes/settings/payments/components/btcpay-card.tsx")
  assert.match(card, /if \(btcpay\?\.available !== true\) \{\s*return null\s*\}/)

  const page = read("../routes/settings/payments/payments.tsx")
  assert.match(page, /const cryptoAvailable = btcpay\?\.available === true/)
  assert.match(page, /visibleMethodKeys\(\{ cryptoAvailable \}\)\.map/)

  const preNotice = read("../routes/settings/payments/components/payment-pre-notice-card.tsx")
  assert.match(preNotice, /key !== "btcpay" \|\| btcpay\?\.available === true/)
  assert.match(preNotice, /methodKeys\.map/)
})
