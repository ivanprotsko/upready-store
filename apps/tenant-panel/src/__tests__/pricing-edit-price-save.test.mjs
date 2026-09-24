import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { castNumber } from "../lib/cast-number.ts"

/**
 * Audit D-05 (t-2026-09-24-n2), picking the product price editor
 * (`/products/:id/prices`) as the most-used screen worth a real test: it is
 * where `handoff/day-2026-09-16-oksana-store/artifacts/
 * accept-f10-price-save-silently-lost-1/` was caught and fixed (PR #51) - a
 * price the panel could not parse used to travel to the server as NaN and
 * come back a silent no-op, and a failed save used to close the drawer as if
 * it had succeeded. Both are guarded here so a future edit cannot reopen
 * either hole unnoticed.
 *
 * `castNumber` is plain TS with no vite macros, so it is imported and run for
 * real. `pricing-edit.tsx` is a JSX form this package cannot render (no
 * vitest/jsdom, see error-boundary-auth.test.mjs for the same note); its
 * tests assert on the source directly, checking the two specific orderings
 * the incident depended on getting wrong.
 */

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, "..")
const source = readFileSync(join(SRC, "routes/products/product-prices/pricing-edit.tsx"), "utf8")

test("castNumber accepts a comma decimal separator and rejects garbage", () => {
  assert.equal(castNumber(1483), 1483, "a number must pass through unchanged")
  assert.equal(castNumber("1483"), 1483, "a plain digit string must parse")
  assert.equal(castNumber("1483,50"), 1483.5, "a Russian comma decimal must parse as a decimal point")
  assert.ok(Number.isNaN(castNumber("abc")), "unparsable input must produce NaN, not silently become 0")
})

test("an unparsable price aborts the save before it reaches the server", () => {
  const guardIndex = source.indexOf("if (invalidFields.length)")
  const mutateIndex = source.indexOf("await mutateAsync(reqData)")

  assert.notEqual(guardIndex, -1, "the invalid-price guard is missing")
  assert.notEqual(mutateIndex, -1, "the mutateAsync call is missing")
  assert.ok(guardIndex < mutateIndex, "the invalid-price guard must run before the request is sent")

  const guardBlock = source.slice(guardIndex, mutateIndex)
  assert.ok(
    /\breturn\b/.test(guardBlock),
    "the invalid-price guard must return before sending the request (f10-price-save-silently-lost)"
  )
})

test("the drawer only closes after the save actually succeeds", () => {
  const tryIndex = source.indexOf("try {")
  const catchIndex = source.indexOf("} catch (error)")

  assert.notEqual(tryIndex, -1, "the try block around mutateAsync is missing")
  assert.notEqual(catchIndex, -1, "the catch block around mutateAsync is missing")
  assert.ok(tryIndex < catchIndex)

  const tryBlock = source.slice(tryIndex, catchIndex)
  const catchBlock = source.slice(catchIndex)

  assert.ok(tryBlock.includes("handleSuccess("), "handleSuccess must run inside the try block, after the save succeeds")
  assert.ok(
    !catchBlock.includes("handleSuccess("),
    "a failed save must not also call handleSuccess - that is what used to close the drawer on failure (f10-price-save-silently-lost)"
  )
  assert.ok(catchBlock.includes("toast.error("), "a failed save must tell the owner, not fail silently")
})
