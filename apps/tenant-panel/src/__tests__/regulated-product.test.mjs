import { test } from "node:test"
import assert from "node:assert/strict"

import {
  REGULATED_AS_CHOICES,
  REGULATED_AS_KEY,
  mergeRegulatedAs,
  readRegulatedAs,
} from "../lib/regulated-product.ts"

/**
 * t-2026-10-09-49 (Ivan's ask 9c7d, item 7): the owner marks a product as a
 * dietary supplement or a medicine in the product form, and the mark is kept
 * in `metadata.regulated_as` next to the product's other keys. The storefront
 * side and the form itself are checked in
 * `apps/storefront/src/modules/products/templates/supplement-notice.test.tsx`.
 *
 *   node --test apps/tenant-panel/src/__tests__/regulated-product.test.mjs
 */

test("the select offers no mark, a supplement and a medicine, in that order", () => {
  assert.deepEqual([...REGULATED_AS_CHOICES], ["none", "supplement", "medicine"])
  assert.equal(REGULATED_AS_KEY, "regulated_as")
})

test("readRegulatedAs reads the two known marks and nothing else", () => {
  assert.equal(readRegulatedAs({ regulated_as: "supplement" }), "supplement")
  assert.equal(readRegulatedAs({ regulated_as: "medicine" }), "medicine")
  for (const value of ["none", "", "Supplement", true, 1, null, undefined]) {
    assert.equal(readRegulatedAs({ regulated_as: value }), null, String(value))
  }
  assert.equal(readRegulatedAs(null), null)
  assert.equal(readRegulatedAs(undefined), null)
})

test("mergeRegulatedAs sets the mark and leaves every other key alone", () => {
  const before = { seo: { ru: { title: "Заголовок" } }, digital: "false" }
  assert.deepEqual(mergeRegulatedAs(before, "supplement"), { ...before, regulated_as: "supplement" })
  assert.deepEqual(mergeRegulatedAs(before, "medicine"), { ...before, regulated_as: "medicine" })
  assert.deepEqual(before, { seo: { ru: { title: "Заголовок" } }, digital: "false" }, "the input is not mutated")
})

test("mergeRegulatedAs with no mark deletes the key instead of storing an empty value", () => {
  const marked = { brand: "Марка", regulated_as: "supplement" }
  assert.deepEqual(mergeRegulatedAs(marked, "none"), { brand: "Марка" })
  assert.deepEqual(mergeRegulatedAs(null, "none"), {})
  assert.deepEqual(mergeRegulatedAs(null, "supplement"), { regulated_as: "supplement" })
})
