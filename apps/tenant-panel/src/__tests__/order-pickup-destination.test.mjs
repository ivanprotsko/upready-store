import { test } from "node:test"
import assert from "node:assert/strict"

import { orderPochtaPoint } from "../lib/order-pickup-point.ts"

/**
 * U-04 (46df UX audit): an order posted to a Russian Post pickup point showed
 * the buyer's home address as «Адрес доставки» above the point, and the packer
 * saw two destinations. The order page reads the point through this helper to
 * put it first, as where the parcel goes.
 */
const order = (data) => ({ shipping_methods: [{ data }] })

test("finds the pickup point the buyer chose", () => {
  const point = orderPochtaPoint(order({ provider: "pochta", pochta_point_index: "117437" }))
  assert.equal(point?.pochta_point_index, "117437")
})

test("an order to a home address has no pickup point", () => {
  assert.equal(orderPochtaPoint(order({ provider: "tariff" })), null)
  assert.equal(orderPochtaPoint({ shipping_methods: [] }), null)
  assert.equal(orderPochtaPoint({}), null)
})

test("a Russian Post method without a point index is not a pickup point", () => {
  assert.equal(orderPochtaPoint(order({ provider: "pochta" })), null)
})
