import type { HttpTypes } from "@medusajs/types"
import { describe, expect, it } from "vitest"
import {
  btcpayCheckoutLink,
  btcpayInvoiceIsOver,
  btcpayReturnState,
  btcpayReturnUrl,
  btcpaySessionOf,
  isBtcpay,
} from "./btcpay"

/**
 * ask-20261005-070255-438f: the storefront's half of BTCPay. The checkout link
 * the button opens comes off the session, so only an http(s) address is ever
 * opened; an invoice that is over is replaced rather than reopened; and a
 * buyer back from BTCPay is told «being confirmed» or «expired» by what the
 * session says, never «failed».
 */

const NOW = Date.parse("2026-10-05T12:00:00.000Z")

const session = (overrides: { status?: string; data?: Record<string, unknown> } = {}) => ({
  provider_id: "pp_btcpay_btcpay",
  status: overrides.status ?? "pending",
  data: {
    checkout_link: "https://pay.example.com/i/inv_1",
    invoice_status: "New",
    additional_status: "None",
    expires_at: "2026-10-05T12:15:00.000Z",
    ...overrides.data,
  },
})

const cartWith = (...sessions: unknown[]) =>
  ({ id: "cart_1", payment_collection: { payment_sessions: sessions } }) as unknown as HttpTypes.StoreCart

describe("isBtcpay and btcpaySessionOf", () => {
  it("know the provider by its prefix and find its session among others", () => {
    expect(isBtcpay("pp_btcpay_btcpay")).toBe(true)
    expect(isBtcpay("pp_robokassa_robokassa")).toBe(false)
    expect(isBtcpay(undefined)).toBe(false)

    const btcpay = session()
    expect(btcpaySessionOf(cartWith({ provider_id: "pp_system_default" }, btcpay))).toBe(btcpay)
    expect(btcpaySessionOf(cartWith({ provider_id: "pp_system_default" }))).toBeNull()
    expect(btcpaySessionOf(null)).toBeNull()
  })
})

describe("btcpayReturnUrl", () => {
  it("leads back to the payment return route with the cart and the locale", () => {
    expect(btcpayReturnUrl("cart_1", { origin: "https://shop.example.com", locale: "ru" })).toBe(
      "https://shop.example.com/api/payment-return?provider=btcpay&cart_id=cart_1&locale=ru"
    )
    expect(btcpayReturnUrl("cart_1", { origin: "https://shop.example.com", locale: "" })).toBe(
      "https://shop.example.com/api/payment-return?provider=btcpay&cart_id=cart_1"
    )
  })
})

describe("btcpayCheckoutLink", () => {
  it("opens only an http(s) address", () => {
    expect(btcpayCheckoutLink(session())).toBe("https://pay.example.com/i/inv_1")
    expect(btcpayCheckoutLink(session({ data: { checkout_link: "javascript:alert(1)" } }))).toBeNull()
    expect(btcpayCheckoutLink(session({ data: { checkout_link: 42 } }))).toBeNull()
    expect(btcpayCheckoutLink(null)).toBeNull()
  })
})

describe("btcpayInvoiceIsOver", () => {
  it("is over once BTCPay says so, the session was canceled, or the expiry passed", () => {
    expect(btcpayInvoiceIsOver(session(), NOW)).toBe(false)
    expect(btcpayInvoiceIsOver(session({ data: { invoice_status: "Expired" } }), NOW)).toBe(true)
    expect(btcpayInvoiceIsOver(session({ data: { invoice_status: "Invalid" } }), NOW)).toBe(true)
    expect(btcpayInvoiceIsOver(session({ status: "canceled" }), NOW)).toBe(true)
    expect(btcpayInvoiceIsOver(session({ data: { expires_at: "2026-10-05T11:59:00.000Z" } }), NOW)).toBe(true)
    expect(btcpayInvoiceIsOver(null, NOW)).toBe(false)
  })
})

describe("btcpayReturnState", () => {
  it("is pending while the invoice is open or the transfer is being confirmed", () => {
    expect(btcpayReturnState(cartWith(session({ data: { invoice_status: "Processing", expires_at: "2099-01-01T00:00:00.000Z" } })))).toBe("pending")
  })

  it("is expired for an invoice that expired with nothing paid", () => {
    expect(btcpayReturnState(cartWith(session({ status: "canceled", data: { invoice_status: "Expired" } })))).toBe("expired")
  })

  it("stays pending for an invoice that expired after a partial or late payment: the buyer must not pay again", () => {
    expect(
      btcpayReturnState(cartWith(session({ status: "requires_more", data: { invoice_status: "Expired", additional_status: "PaidPartial" } })))
    ).toBe("pending")
    expect(
      btcpayReturnState(cartWith(session({ status: "requires_more", data: { invoice_status: "Expired", additional_status: "PaidLate" } })))
    ).toBe("pending")
  })

  it("says nothing for a cart without a BTCPay session", () => {
    expect(btcpayReturnState(cartWith({ provider_id: "pp_robokassa_robokassa", status: "pending" }))).toBeNull()
  })
})
