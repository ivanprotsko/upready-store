import { describe, expect, it } from "vitest"

import { hasUnfinishedRobokassaPayment } from "./robokassa-return"

const cartWith = (
  sessions: { provider_id: string; status?: string }[],
  extra: Record<string, unknown> = {}
) =>
  ({
    id: "cart_1",
    completed_at: null,
    payment_collection: { payment_sessions: sessions },
    ...extra,
  }) as unknown as Parameters<typeof hasUnfinishedRobokassaPayment>[0]

describe("hasUnfinishedRobokassaPayment (U-02, 46df)", () => {
  it("is true when the buyer left for Robokassa from this cart and the session is still unpaid", () => {
    expect(
      hasUnfinishedRobokassaPayment(
        cartWith([{ provider_id: "pp_robokassa_robokassa", status: "pending" }]),
        "cart_1"
      )
    ).toBe(true)
  })

  it("is false when the buyer never pressed Pay for this cart", () => {
    const cart = cartWith([{ provider_id: "pp_robokassa_robokassa", status: "pending" }])
    expect(hasUnfinishedRobokassaPayment(cart, null)).toBe(false)
    // A mark left by an older cart says nothing about this one.
    expect(hasUnfinishedRobokassaPayment(cart, "cart_0")).toBe(false)
  })

  it("is false once the buyer switched to another payment method", () => {
    expect(
      hasUnfinishedRobokassaPayment(
        cartWith([{ provider_id: "pp_system_default", status: "pending" }]),
        "cart_1"
      )
    ).toBe(false)
  })

  it("is false when the payment went through", () => {
    expect(
      hasUnfinishedRobokassaPayment(
        cartWith([{ provider_id: "pp_robokassa_robokassa", status: "captured" }]),
        "cart_1"
      )
    ).toBe(false)
    expect(
      hasUnfinishedRobokassaPayment(
        cartWith([{ provider_id: "pp_robokassa_robokassa", status: "pending" }], {
          completed_at: "2026-09-30T00:00:00Z",
        }),
        "cart_1"
      )
    ).toBe(false)
  })
})
