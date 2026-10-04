import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * t-2026-10-04-48. Ivan: «человек ведь уже выбирал чекбоксы и заказ не менял,
 * поэтому правильно, чтобы они были выбраны». The section used to start every
 * render at `EMPTY_CONSENT` although the cart carried the buyer's own record, and
 * wrote that record as `{ ...cart.metadata, checkout_consent }`, which put a stale
 * copy of the contacts back over newer ones. The section is a large client
 * component with the payment providers inside; the rule it follows is asserted on
 * its source, the convention `checkout/page.test.ts` uses, and the logic itself is
 * covered in `lib/util/checkout-consent.test.ts` (`restoreConsent`) and
 * `lib/data/cart-metadata.test.ts` (the merge).
 */

const source = readFileSync(join(__dirname, "index.tsx"), "utf8")

describe("CheckoutPaymentSection: the consent boxes start from the cart's record", () => {
  it("initialises the boxes from the stored record, not from EMPTY_CONSENT", () => {
    expect(source).toContain("readConsentRecord(cart.metadata")
    expect(source).toMatch(/useState<CheckoutConsentValue>\(\(\) =>\s*restoreConsent\(storedConsent, legal\)/)
    expect(source).not.toMatch(/useState<CheckoutConsentValue>\(EMPTY_CONSENT\)/)
  })

  it("counts a restored personal-data tick as already recorded, so the pay button is not held back", () => {
    expect(source).toMatch(/useState\(\(\) => consent\.personalData\)/)
  })

  it("writes the consent key alone and never spreads a rendered cart.metadata", () => {
    expect(source).not.toMatch(/\.\.\.\s*metadata\b/)
    expect(source).not.toMatch(/\.\.\.\s*\(?cart\.metadata/)
  })
})
