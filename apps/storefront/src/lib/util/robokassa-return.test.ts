import { describe, expect, it } from "vitest"

import {
  PAYMENT_RETURN_INTERVAL_MS,
  PAYMENT_RETURN_WINDOW_MS,
  hasUnfinishedRobokassaPayment,
  nextPaymentReturnStep,
  readPaymentReturnNotice,
} from "./robokassa-return"

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

describe("readPaymentReturnNotice (t-2026-10-04-48)", () => {
  it("reads the two notices the return writes", () => {
    expect(readPaymentReturnNotice("failed")).toBe("failed")
    expect(readPaymentReturnNotice("pending")).toBe("pending")
  })

  it("says nothing for anything else, so no query value reaches the screen", () => {
    expect(readPaymentReturnNotice(undefined)).toBeNull()
    expect(readPaymentReturnNotice("")).toBeNull()
    expect(readPaymentReturnNotice("<script>")).toBeNull()
    expect(readPaymentReturnNotice(["failed", "pending"])).toBeNull()
  })
})

describe("nextPaymentReturnStep: the waiting page's ~30 s (t-2026-10-04-48)", () => {
  it("opens the order as soon as the cart is one", () => {
    expect(nextPaymentReturnStep("order", 0)).toBe("open_order")
    expect(nextPaymentReturnStep("order", PAYMENT_RETURN_WINDOW_MS + 1)).toBe("open_order")
  })

  it("asks again while the payment is pending and the window is open", () => {
    expect(nextPaymentReturnStep("pending", 0)).toBe("ask_again")
    expect(
      nextPaymentReturnStep("pending", PAYMENT_RETURN_WINDOW_MS - PAYMENT_RETURN_INTERVAL_MS)
    ).toBe("ask_again")
  })

  it("goes back to the checkout with the pending notice once another wait would pass 30 s", () => {
    expect(
      nextPaymentReturnStep("pending", PAYMENT_RETURN_WINDOW_MS - PAYMENT_RETURN_INTERVAL_MS + 1)
    ).toBe("back_to_checkout")
    expect(PAYMENT_RETURN_WINDOW_MS).toBe(30_000)
  })

  it("has nothing to wait for without a cart", () => {
    expect(nextPaymentReturnStep("no_cart", 0)).toBe("back_to_checkout")
  })

  it("asks about a dozen times in the window, not once and not a hundred", () => {
    let elapsed = 0
    let looks = 1
    while (nextPaymentReturnStep("pending", elapsed) === "ask_again") {
      elapsed += PAYMENT_RETURN_INTERVAL_MS
      looks += 1
    }
    expect(looks).toBeGreaterThanOrEqual(10)
    expect(looks).toBeLessThanOrEqual(13)
  })
})
