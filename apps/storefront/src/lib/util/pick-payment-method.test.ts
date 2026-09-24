import { describe, expect, it } from "vitest"

import { pickActivePaymentMethod } from "./pick-payment-method"

describe("pickActivePaymentMethod", () => {
  it("keeps the current selection when it is still available", () => {
    expect(
      pickActivePaymentMethod("pp_robokassa_robokassa", [
        { id: "pp_robokassa_robokassa" },
        { id: "pp_system_default" },
      ])
    ).toBe("pp_robokassa_robokassa")
  })

  it("falls back to the first available method once the current one is gone (t-2026-09-24-n10)", () => {
    // The owner turned Robokassa off, or it never was connected, while the
    // buyer's cart still held that session: the checkout must not keep the
    // dead selection.
    expect(
      pickActivePaymentMethod("pp_robokassa_robokassa", [{ id: "pp_system_default" }])
    ).toBe("pp_system_default")
  })

  it("returns an empty string when the shop offers nothing at all, no crash", () => {
    expect(pickActivePaymentMethod("pp_robokassa_robokassa", [])).toBe("")
    expect(pickActivePaymentMethod("", [])).toBe("")
  })

  it("picks the first available method when nothing was selected yet", () => {
    expect(pickActivePaymentMethod("", [{ id: "pp_system_default" }])).toBe("pp_system_default")
  })
})
