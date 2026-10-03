import { test } from "node:test"
import assert from "node:assert/strict"

import { connectedMethodKeys, isDemoOnly } from "../lib/payment-methods-summary.ts"

/**
 * «Приём оплат» status badges (t-2026-09-24-n10): `payment-methods-summary.ts`
 * is plain TS with no JSX, so it is imported and run for real (see
 * pricing-edit-price-save.test.mjs for the same note on why this package's
 * tests do that instead of rendering).
 *
 * t-cherk-com-hotfix batch 6: the owner's crypto and card-via-manager methods
 * collapsed into one list, «Перевод по реквизитам» — the panel now shows ONE
 * `manual` row, on if either backend half (`manualCrypto`, `manualManager`) is.
 */

const methods = (overrides = {}) => ({
  robokassa: false,
  manualCrypto: false,
  manualManager: false,
  demo: true,
  ...overrides,
})

test("connectedMethodKeys lists nothing when the shop connected nothing", () => {
  assert.deepEqual(connectedMethodKeys(methods()), [])
})

test("connectedMethodKeys names Robokassa and the one manual method when either half of it is connected", () => {
  assert.deepEqual(connectedMethodKeys(methods({ robokassa: true, demo: false })), ["robokassa"])
  assert.deepEqual(connectedMethodKeys(methods({ manualCrypto: true, demo: false })), ["manual"])
  assert.deepEqual(connectedMethodKeys(methods({ manualManager: true, demo: false })), ["manual"])
  assert.deepEqual(
    connectedMethodKeys(methods({ manualCrypto: true, manualManager: true, demo: false })),
    ["manual"]
  )
  assert.deepEqual(
    connectedMethodKeys(methods({ robokassa: true, manualCrypto: true, demo: false })),
    ["robokassa", "manual"]
  )
})

test("connectedMethodKeys never lists the demo card as a connected method", () => {
  assert.deepEqual(connectedMethodKeys(methods({ demo: true })), [])
})

test("isDemoOnly mirrors the resolver's own demo flag", () => {
  assert.equal(isDemoOnly(methods({ demo: true })), true)
  assert.equal(isDemoOnly(methods({ robokassa: true, demo: false })), false)
})
