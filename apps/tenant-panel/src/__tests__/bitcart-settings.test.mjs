import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { bitcartDraftErrors, bitcartDraftFrom, bitcartPayload } from "../lib/bitcart-settings.ts"

/**
 * «Криптовалюта (Bitcart)» on «Приём оплат» (ask-20261005-070255-438f, stage
 * 2). `bitcart-settings.ts` is plain TS with no JSX, so it is imported and run
 * for real. What it pins down: a token the owner leaves empty is never sent
 * (the stored one stays), the switch cannot go on with a value missing (the
 * admin address included, since that is where the buyer pays), and both
 * addresses follow the backend's rules.
 */

const stored = {
  id: "tis_1",
  provider: "bitcart",
  is_enabled: false,
  server_url: "https://pay.example.com/api",
  admin_url: "https://pay.example.com/admin",
  store_id: "01JSTORE1",
  api_key: { set: true, last4: "1234" },
}

test("the form starts from the stored store, with the token empty", () => {
  assert.deepEqual(bitcartDraftFrom(stored), {
    enabled: false,
    server_url: "https://pay.example.com/api",
    admin_url: "https://pay.example.com/admin",
    store_id: "01JSTORE1",
    api_key: "",
  })
  assert.equal(bitcartDraftFrom(null).admin_url, "")
})

test("an empty token is left out of the PUT, so the stored one stays", () => {
  const body = bitcartPayload({ ...bitcartDraftFrom(stored), enabled: true })
  assert.deepEqual(body, {
    is_enabled: true,
    server_url: "https://pay.example.com/api",
    admin_url: "https://pay.example.com/admin",
    store_id: "01JSTORE1",
  })
  assert.equal("api_key" in body, false)
  assert.equal(bitcartPayload({ ...bitcartDraftFrom(stored), api_key: "  new-token " }).api_key, "new-token")
})

test("switching on needs all four values, a stored token counting as present", () => {
  assert.deepEqual(bitcartDraftErrors({ ...bitcartDraftFrom(stored), enabled: true }, stored), {})

  const fresh = { enabled: true, server_url: "https://pay.example.com/api", admin_url: "", store_id: "", api_key: "t" }
  assert.deepEqual(bitcartDraftErrors(fresh, null), {
    admin_url: "bitcart.errors.required",
    store_id: "bitcart.errors.required",
  })
})

test("a switched-off store may be saved incomplete", () => {
  assert.deepEqual(
    bitcartDraftErrors({ enabled: false, server_url: "", admin_url: "", store_id: "", api_key: "" }, null),
    {}
  )
})

test("both addresses follow the backend's rules", () => {
  const errors = bitcartDraftErrors(
    {
      enabled: false,
      server_url: "http://pay.example.com/api",
      admin_url: "https://pay.example.com/admin?x=1",
      store_id: "a/b",
      api_key: "",
    },
    null
  )
  assert.deepEqual(errors, {
    server_url: "bitcart.errors.url",
    admin_url: "bitcart.errors.url",
    store_id: "bitcart.errors.storeId",
  })
  assert.deepEqual(
    bitcartDraftErrors(
      { enabled: false, server_url: "http://localhost:8000", admin_url: "http://localhost:3000", store_id: "", api_key: "" },
      null
    ),
    {}
  )
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

test("every Bitcart string exists in both panel languages, translated", () => {
  const en = keysOf(catalogs.en.bitcart).sort()
  const ru = keysOf(catalogs.ru.bitcart).sort()
  assert.deepEqual(ru, en)
  assert.ok(en.length > 10)
  assert.notEqual(catalogs.ru.bitcart.title, catalogs.en.bitcart.title)
  assert.notEqual(catalogs.ru.bitcart.refundHint, catalogs.en.bitcart.refundHint)
  assert.ok(catalogs.en.paymentSettings.methodsSummary.bitcart)
  assert.ok(catalogs.ru.paymentSettings.methodsSummary.bitcart)
})

/**
 * The same instance switch as BTCPay's: where the backend answers
 * `available: false` (RU) the panel shows Bitcart nowhere. Checked in the
 * source, as the BTCPay suite does, because this package has no JSX runtime.
 * t-2026-10-14-01 (G3): the card is its own address and leads back to the
 * list there; the notice before payment is its section.
 */
test("the card, the list and the pre-payment notice all hide Bitcart unless the backend says available", () => {
  const card = read("../routes/settings/payments/components/bitcart-card.tsx")
  assert.match(
    card,
    /if \(bitcart && bitcart\.available !== true\) \{\s*return <Navigate to="\/settings\/payments" replace \/>\s*\}/
  )
  assert.ok(card.indexOf("bitcart.available !== true") < card.indexOf("<SettingsDetail"))
  assert.match(card, /usePreNoticeSection\("bitcart"\)/)

  const ways = read("../routes/settings/payments/payment-ways.ts")
  assert.match(ways, /const CRYPTO_WAYS: PaymentWay\[\] = \["btcpay", "bitcart", "x402"\]/)
})

test("the refund and notification texts stay, as read sections at the bottom of the card", () => {
  const card = read("../routes/settings/payments/components/bitcart-card.tsx")
  assert.match(card, /title: t\("bitcart\.refundTitle"\)/)
  assert.match(card, /description: t\("bitcart\.refundHint"\)/)
  assert.match(card, /bitcart\?\.notification_url \? t\("bitcart\.notificationHint"\) : t\("bitcart\.notificationOff"\)/)
  assert.match(card, /sections=\{\[stateSection, requisitesSection, preNotice\.section, refundSection, notificationSection\]\}/)
})
