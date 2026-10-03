import { test } from "node:test"
import assert from "node:assert/strict"

import { EMPTY_PRE_NOTICE_ENTRY, shouldShowPrePaymentNotice } from "../lib/payment-pre-notice.ts"

test("shouldShowPrePaymentNotice hides the notice on the shop's own page, same currency", () => {
  assert.equal(shouldShowPrePaymentNotice(EMPTY_PRE_NOTICE_ENTRY, "rub"), false)
})

test("shouldShowPrePaymentNotice shows the notice when the charge currency differs", () => {
  assert.equal(
    shouldShowPrePaymentNotice({ ...EMPTY_PRE_NOTICE_ENTRY, charge_currency_code: "usd" }, "rub"),
    true,
  )
})

test("shouldShowPrePaymentNotice is case-insensitive on the currency comparison", () => {
  assert.equal(
    shouldShowPrePaymentNotice({ ...EMPTY_PRE_NOTICE_ENTRY, charge_currency_code: "RUB" }, "Rub"),
    false,
  )
})

test("shouldShowPrePaymentNotice shows the notice for a foreign card alone", () => {
  assert.equal(
    shouldShowPrePaymentNotice({ ...EMPTY_PRE_NOTICE_ENTRY, is_foreign_card: true }, "rub"),
    true,
  )
})

test("shouldShowPrePaymentNotice shows the notice for a redirect kind alone", () => {
  assert.equal(
    shouldShowPrePaymentNotice({ ...EMPTY_PRE_NOTICE_ENTRY, redirect_kind: "crypto_network" }, "rub"),
    true,
  )
})
