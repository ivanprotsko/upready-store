import { describe, expect, it } from "vitest"

import { awaitsPayment, buyerOrderStatus } from "./buyer-order-status"

const order = (
  payment_status: string,
  metadata: Record<string, unknown> | null = null,
  status = "pending"
) => ({ status, payment_status, metadata }) as Parameters<typeof buyerOrderStatus>[0]

describe("buyerOrderStatus", () => {
  it("is «awaiting payment» for a fresh manual order with no receipt", () => {
    expect(buyerOrderStatus(order("authorized"))).toBe("awaitingPayment")
    expect(buyerOrderStatus(order("awaiting", {}))).toBe("awaitingPayment")
    expect(buyerOrderStatus(order("not_paid", { payment_receipt: null }))).toBe("awaitingPayment")
  })

  it("is «awaiting confirmation» once a receipt is on the order and nothing is captured", () => {
    expect(
      buyerOrderStatus(order("authorized", { payment_receipt: { file_url: "/x.jpg", sent_at: "2026-10-03" } }))
    ).toBe("awaitingConfirmation")
  })

  it("is «receipt rejected» when the shop refused the last receipt", () => {
    expect(
      buyerOrderStatus(
        order("authorized", {
          payment_receipt: { status: "rejected", rejected_reason: "размытый скриншот", rejected_at: "2026-10-03" },
        })
      )
    ).toBe("receiptRejected")
  })

  it("is «paid» once captured, whatever the receipt says", () => {
    expect(buyerOrderStatus(order("captured", { payment_receipt: { status: "rejected" } }))).toBe("paid")
    expect(buyerOrderStatus(order("partially_captured"))).toBe("paid")
  })

  it("is «canceled» for a cancelled order before anything else", () => {
    expect(buyerOrderStatus(order("captured", null, "canceled"))).toBe("canceled")
    expect(buyerOrderStatus(order("authorized", { payment_receipt: {} }, "canceled"))).toBe("canceled")
  })

  it("is «refunded» after a refund", () => {
    expect(buyerOrderStatus(order("refunded"))).toBe("refunded")
    expect(buyerOrderStatus(order("partially_refunded"))).toBe("refunded")
  })

  it("awaitsPayment covers the three unpaid states only", () => {
    expect(awaitsPayment(order("authorized"))).toBe(true)
    expect(awaitsPayment(order("authorized", { payment_receipt: {} }))).toBe(true)
    expect(awaitsPayment(order("authorized", { payment_receipt: { status: "rejected" } }))).toBe(true)
    expect(awaitsPayment(order("captured"))).toBe(false)
    expect(awaitsPayment(order("authorized", null, "canceled"))).toBe(false)
    expect(awaitsPayment(order("refunded"))).toBe(false)
  })
})
