import type { HttpTypes } from "@medusajs/types"
import { describe, expect, it } from "vitest"
import {
  bitcartCheckoutLink,
  bitcartInvoiceIsOver,
  bitcartReturnState,
  bitcartReturnUrl,
  bitcartSessionOf,
  isBitcart,
} from "./bitcart"

/**
 * ask-20261005-070255-438f, stage 2: the storefront's half of Bitcart. The
 * checkout link the button opens comes off the session, so only an http(s)
 * address is ever opened; an invoice that is over is replaced rather than
 * reopened; and a buyer back from Bitcart is told «being confirmed» or
 * «expired» by what the session says, never «failed».
 */

const NOW = Date.parse("2026-10-05T12:00:00.000Z")

const session = (overrides: { status?: string; data?: Record<string, unknown> } = {}) => ({
  provider_id: "pp_bitcart_bitcart",
  status: overrides.status ?? "pending",
  data: {
    checkout_link: "https://pay.example.com/admin/i/01JINV1",
    invoice_status: "pending",
    exception_status: "none",
    expires_at: "2026-10-05T12:15:00.000Z",
    ...overrides.data,
  },
})

const cartWith = (...sessions: unknown[]) =>
  ({ id: "cart_1", payment_collection: { payment_sessions: sessions } }) as unknown as HttpTypes.StoreCart

describe("isBitcart and bitcartSessionOf", () => {
  it("know the provider by its prefix and find its session next to BTCPay's", () => {
    expect(isBitcart("pp_bitcart_bitcart")).toBe(true)
    expect(isBitcart("pp_btcpay_btcpay")).toBe(false)
    expect(isBitcart(undefined)).toBe(false)

    const bitcart = session()
    expect(bitcartSessionOf(cartWith({ provider_id: "pp_btcpay_btcpay" }, bitcart))).toBe(bitcart)
    expect(bitcartSessionOf(cartWith({ provider_id: "pp_btcpay_btcpay" }))).toBeNull()
    expect(bitcartSessionOf(null)).toBeNull()
  })
})

describe("bitcartReturnUrl", () => {
  it("leads back to the payment-return route, naming the provider, the cart and the locale", () => {
    expect(bitcartReturnUrl("cart_1", { origin: "https://shop.example.com", locale: "ru" })).toBe(
      "https://shop.example.com/api/payment-return?provider=bitcart&cart_id=cart_1&locale=ru"
    )
    expect(bitcartReturnUrl("cart_1", { origin: "https://shop.example.com", locale: "" })).toBe(
      "https://shop.example.com/api/payment-return?provider=bitcart&cart_id=cart_1"
    )
  })
})

describe("bitcartCheckoutLink", () => {
  it("opens only an http(s) address", () => {
    expect(bitcartCheckoutLink(session())).toBe("https://pay.example.com/admin/i/01JINV1")
    expect(bitcartCheckoutLink(session({ data: { checkout_link: "javascript:alert(1)" } }))).toBeNull()
    expect(bitcartCheckoutLink(session({ data: { checkout_link: 42 } }))).toBeNull()
    expect(bitcartCheckoutLink(null)).toBeNull()
  })
})

describe("bitcartInvoiceIsOver", () => {
  it("is over once Bitcart says expired, invalid or refunded, the session is canceled, or the time has passed", () => {
    expect(bitcartInvoiceIsOver(session(), NOW)).toBe(false)
    expect(bitcartInvoiceIsOver(session({ data: { invoice_status: "paid" } }), NOW)).toBe(false)
    expect(bitcartInvoiceIsOver(session({ data: { invoice_status: "expired" } }), NOW)).toBe(true)
    expect(bitcartInvoiceIsOver(session({ data: { invoice_status: "invalid" } }), NOW)).toBe(true)
    expect(bitcartInvoiceIsOver(session({ data: { invoice_status: "refunded" } }), NOW)).toBe(true)
    expect(bitcartInvoiceIsOver(session({ status: "canceled" }), NOW)).toBe(true)
    expect(bitcartInvoiceIsOver(session({ data: { expires_at: "2026-10-05T11:59:00.000Z" } }), NOW)).toBe(true)
    expect(bitcartInvoiceIsOver(null, NOW)).toBe(false)
  })
})

describe("bitcartReturnState", () => {
  it("says pending while the network confirms, expired when nothing was paid, and pending again for a partial payment", () => {
    // The real clock decides here, so the open invoice expires far in the future.
    expect(
      bitcartReturnState(cartWith(session({ data: { invoice_status: "paid", expires_at: "2099-01-01T00:00:00.000Z" } })))
    ).toBe("pending")
    expect(bitcartReturnState(cartWith(session({ data: { invoice_status: "expired" } })))).toBe("expired")
    expect(
      bitcartReturnState(cartWith(session({ data: { invoice_status: "expired", exception_status: "paid_partial" } })))
    ).toBe("pending")
    expect(bitcartReturnState(cartWith({ provider_id: "pp_btcpay_btcpay" }))).toBeNull()
  })
})
