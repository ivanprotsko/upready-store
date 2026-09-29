import { test } from "node:test"
import assert from "node:assert/strict"

import { formatProvider } from "../lib/format-provider.ts"
import { getOrderFulfillmentStatus, getPaymentProviderLabel } from "../lib/order-helpers.ts"

/**
 * U-16 (46df UX audit): a paid order waiting to be packed is ordinary work,
 * not an alarm, and a payment method is not a technical id. Both helpers have
 * no JSX, so they are imported and run for real with a `t` that echoes keys.
 */
const t = (key) => key

test("an order not yet packed is blue «in progress», not red", () => {
  assert.equal(getOrderFulfillmentStatus(t, "not_fulfilled").color, "blue")
})

test("red stays for a cancelled fulfillment", () => {
  assert.equal(getOrderFulfillmentStatus(t, "canceled").color, "red")
})

test("formatProvider does not repeat a type equal to the name", () => {
  assert.equal(formatProvider("pp_robokassa_robokassa"), "Robokassa")
  assert.equal(formatProvider("pp_stripe-blik_dkk"), "Stripe Blik (DKK)")
})

test("Robokassa gets its own label from the translations", () => {
  assert.equal(getPaymentProviderLabel(t, "pp_robokassa_robokassa"), "orders.payment.provider.robokassa")
})
